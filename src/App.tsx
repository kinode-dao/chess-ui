import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  MouseEvent,
  useRef,
} from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import UqbarEncryptorApi from "@uqbar/client-encryptor-api";
import useChessStore, { Game } from "./store";
import "./App.css";

declare global {
  var window: Window & typeof globalThis;
  var our: { node: string; process: string };
}

const BASE_URL = import.meta.env.BASE_URL;
if (window.our) window.our.process = BASE_URL?.replace("/", "");

const PROXY_TARGET = `${
  import.meta.env.VITE_NODE_URL || "http://localhost:8080"
}${BASE_URL}`;

interface SelectedGame extends Game {
  game: Chess;
}

const isTurn = (game: Game, node: string) =>
  (game.turns || 0) % 2 === 0 ? node === game.white : node === game.black;

// This env also has BASE_URL which should match the process + package name
const WEBSOCKET_URL = import.meta.env.DEV
  ? `${PROXY_TARGET.replace("http", "ws")}`
  : undefined;

function App() {
  const { games, handleWsMessage, set } = useChessStore();
  const [screen, setScreen] = useState("new");
  const [newGame, setNewGame] = useState("");
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(560 - 20);

  const resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      setBoardWidth(
        Math.min(entry.contentRect.width, entry.contentRect.height) - 16
      );
    }
  });

  if (boardContainerRef.current) {
    resizeObserver.observe(boardContainerRef.current);
  }

  const game: SelectedGame | undefined = useMemo(
    () =>
      games[screen]
        ? { ...games[screen], game: new Chess(games[screen].board) }
        : undefined,
    [games, screen]
  );
  const currentTurn = useMemo(
    () =>
      (game?.turns || 0) % 2 === 0
        ? `${game?.white} (white)`
        : `${game?.black} (black)`,
    [game]
  );

  useEffect(() => {
    new UqbarEncryptorApi({
      uri: WEBSOCKET_URL,
      nodeId: window.our.node,
      processId: window.our.process,
      onMessage: handleWsMessage,
    });

    fetch(`${BASE_URL}/games`)
      .then((res) => res.json())
      .then((games) => {
        set({ games });
      })
      .catch(console.error);
  }, []); // eslint-disable-line

  const startNewGame = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      try {
        const createdGame = await fetch(`${BASE_URL}/games`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: newGame }),
        }).then((r) => {
          if (r.status === 409) {
            if (games[newGame]) {
              setScreen(newGame);
            } else {
              alert(
                "Game already exists, please refresh the page and select it."
              );
            }
            throw new Error("Game already exists");
          } else if (r.status === 503) {
            alert(
              `${newGame} may be offline, please confirm it is online and try again.`
            );
            throw new Error("Player offline");
          } else if (r.status === 400) {
            alert("Please enter a valid player ID");
            throw new Error("Invalid player ID");
          } else if (r.status > 399) {
            alert("There was an error creating the game. Please try again.");
            throw new Error("Error creating game");
          }

          return r.json();
        });

        const allGames = { ...games };
        allGames[createdGame.id] = createdGame;
        set({ games: allGames });
        setScreen(newGame);
        setNewGame("");
      } catch (err) {
        console.error(err);
      }
    },
    [games, newGame, setNewGame, set]
  );

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      if (!game || !isTurn(game, window.our.node)) return false;

      const move = {
        from: sourceSquare,
        to: targetSquare,
        promotion: "q", // always promote to a queen for example simplicity
      };
      const gameCopy = { ...game };
      const result = gameCopy.game.move(move);

      if (result === null) {
        return false;
      }

      gameCopy.board = gameCopy.game.fen();
      const allGames = { ...games };
      allGames[game.id] = gameCopy;
      set({ games: allGames });

      fetch(`${BASE_URL}/games`, {
        method: "PUT",
        body: JSON.stringify({
          id: game.id,
          move: sourceSquare + targetSquare,
        }),
      })
        .then((r) => r.json())
        .then((updatedGame) => {
          const allGames = { ...games };
          allGames[game.id] = updatedGame;
          set({ games: allGames });
        })
        .catch((err) => {
          console.error(err);
          alert("There was an error making your move. Please try again");
          // reset the board
          const allGames = { ...games };
          const gameCopy = { ...game };
          gameCopy.game.undo();
          allGames[game.id] = gameCopy;
          set({ games: allGames });
        });

      return true;
    },
    [game, games, set]
  );

  const resignGame = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!game) return;

      if (!window.confirm("Are you sure you want to resign this game?")) return;

      fetch(`${BASE_URL}/games?id=${game.id}`, {
        method: "DELETE",
      })
        .then((r) => r.json())
        .then((updatedGame) => {
          const allGames = { ...games };
          allGames[game.id] = updatedGame;
          set({ games: allGames });
        })
        .catch((err) => {
          console.error(err);
          alert("There was an error resigning the game. Please try again");
        });
    },
    [game]
  );

  const rematchGame = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!game) return;

      try {
        const createdGame = await fetch(`${BASE_URL}/games`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: game.id }),
        }).then((r) => r.json());

        const allGames = { ...games };
        allGames[createdGame.id] = createdGame;
        set({ games: allGames });
      } catch (err) {
        console.error(err);
        alert(
          "You could not create the game. Please make sure your current game with this player (if any) has ended and try again."
        );
      }
    },
    [game]
  );

  return (
    <div
      className="flex flex-col justify-center items-center"
      style={{ height: "100%" }}
    >
      <div
        className="flex flex-col justify-center"
        style={{
          maxHeight: "100vh",
          maxWidth: "800px",
          height: "100%",
          width: "100%",
          position: "relative",
        }}
      >
        <a
          href="/"
          className="absolute top-6 left-0 ml-2"
          style={{ fontSize: 24 }}
          onClick={(e) => {
            e.preventDefault();
            window.history.back();
          }}
        >
          <span style={{ fontSize: 18, marginBottom: 4 }}>&#x25c0;</span> Back
        </a>
        <h4 className="m-4 row justify-center">
          Chess by
          <svg
            width="180"
            height="20"
            viewBox="0 0 580 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g clip-path="url(#clip0_6_641)">
              <path
                d="M0.824922 1.07031L0.794922 70.0703H14.7949L14.8049 1.07031H0.824922Z"
                fill="#FFF5D9"
              />
              <path
                d="M16.5947 36.8803L41.2547 1.07031H58.2447L33.1647 36.8803L61.2447 70.0703H42.9947L16.5947 36.8803Z"
                fill="#FFF5D9"
              />
              <path
                d="M119.885 1.07031H105.765V70.0703H119.885V1.07031Z"
                fill="#FFF5D9"
              />
              <path
                d="M173.185 1.07031V70.0703H186.775V26.8303L224.045 70.0703H234.825V1.07031H221.325V45.6803L183.445 1.07031H173.185Z"
                fill="#FFF5D9"
              />
              <path
                d="M342.465 8.86C333.025 0.15 321.645 0 318.535 0C315.475 0 303.575 0.22 294.005 9.52C283.845 19.4 283.805 32.24 283.795 35.66C283.785 39.3 283.895 49.03 290.805 57.99C300.855 71.02 316.695 71.31 318.535 71.32C321.375 71.32 334.185 71 343.965 60.66C353.065 51.04 353.265 39.4 353.275 35.66C353.275 32.49 353.305 18.86 342.455 8.86H342.465ZM318.435 58.01C307.095 58.01 297.895 47.95 297.895 35.54C297.895 23.13 307.085 13.07 318.435 13.07C329.785 13.07 338.975 23.13 338.975 35.54C338.975 47.95 329.785 58.01 318.435 58.01Z"
                fill="#FFF5D9"
              />
              <path
                d="M450.495 12.0802C444.975 5.46023 437.135 0.990234 427.955 0.990234C417.555 0.990234 405.295 1.07023 402.295 1.07023V69.9802C405.285 69.9802 417.555 70.0602 427.955 70.0602C445.525 70.0602 458.445 53.4102 459.065 36.8602C459.395 28.0102 456.185 18.9002 450.495 12.0802ZM440.085 49.9502C436.895 53.8702 432.705 56.6902 427.665 57.5602C424.025 58.1902 420.095 57.8302 416.405 57.8302C416.405 50.4002 416.405 42.9802 416.405 35.5502V13.2202C423.795 13.2202 430.525 12.7002 436.605 17.6002C440.275 20.5602 442.925 24.7102 444.165 29.2402C444.525 30.5402 444.765 31.8802 444.875 33.2302C445.395 39.3702 443.995 45.1402 440.085 49.9502Z"
                fill="#FFF5D9"
              />
              <path
                d="M508.135 0.990234V70.0602H552.715V57.9302H522.035V40.4202H547.125V28.0702H521.995V13.3202H552.715V0.990234H508.135Z"
                fill="#FFF5D9"
              />
              <path
                d="M574.835 66.0398H572.745L571.015 63.0698H569.845V66.0398H567.805V57.5498H571.765C572.845 57.5498 573.865 57.9298 574.425 58.9398C575.205 60.3698 574.665 62.3798 573.105 63.0298C573.725 64.1198 574.225 64.9498 574.845 66.0398H574.835ZM570.375 61.0798H570.845C571.335 61.0798 572.365 61.0798 572.365 60.2898C572.365 59.5598 571.335 59.5598 570.845 59.5598H570.375V61.0798Z"
                fill="#FFF5D9"
              />
              <path
                d="M570.964 69.0002C574.913 69.0002 578.114 65.799 578.114 61.8502C578.114 57.9014 574.913 54.7002 570.964 54.7002C567.016 54.7002 563.814 57.9014 563.814 61.8502C563.814 65.799 567.016 69.0002 570.964 69.0002Z"
                stroke="#FFF5D9"
                stroke-width="2.2"
                strokeMiterlimit="10"
              />
            </g>
            <defs>
              <clipPath id="clip0_6_641">
                <rect
                  width="578.41"
                  height="71.32"
                  fill="white"
                  transform="translate(0.794922)"
                />
              </clipPath>
            </defs>
          </svg>
        </h4>
        <div
          className="flex flex-row justify-between items-center"
          style={{ height: "100%" }}
        >
          {Object.keys(games).length > 0 && (
            <div
              className="flex flex-col games items-center"
              style={{ width: "25%", height: "100%", gap: '1em', padding: '1em'}}
            >
              <h4 className="m-2">Games</h4>
              <button className="small" style={{width: '100%'}} onClick={() => setScreen("new")}>New</button>
              <div className="flex flex-col overflow-scroll" style={{ width: "100%" }}>
                {Object.values(games).map((game) => (
                  <div
                    key={game?.id}
                    onClick={() => setScreen(game?.id)}
                    className={`game-entry ${
                      screen !== game?.id && isTurn(game, window.our.node)
                        ? "is-turn"
                        : ""
                    } ${screen === game?.id ? "selected" : ""} ${
                      game?.ended ? "ended" : ""
                    }`}
                  >
                    {game?.id}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div
            className="flex flex-col justify-center items-center game"
            style={{ width: Object.keys(games).length > 0 ? "calc(75% - 16px)" : "100%", height: "100%"}}
            ref={boardContainerRef}
          >
            {screen === "new" || !game ? (
              <>
                <h3>Start New Game</h3>
                <h5 className="mb-8 orange-text">(game creator will be white)</h5>
                <form
                  onSubmit={startNewGame}
                  className="flex flex-col justify-center mb-40"
                  style={{ maxWidth: 400 }}
                >
                  <label
                    className="mb-2"
                    style={{ alignSelf: "flex-start", fontWeight: "600" }}
                  >
                    Player ID
                  </label>
                  <input
                    className="border rounded p-2 mb-2"
                    style={{ minWidth: 300 }}
                    type="text"
                    placeholder="Player ID"
                    value={newGame}
                    onChange={(e) => setNewGame(e.target.value)}
                  />
                  <button type="submit">Start Game</button>
                </form>
              </>
            ) : (
              <>
                <div className="flex flex-row justify-between items-center w-full px-4 pb-2 gap-4">
                  <h4>{screen}</h4>
                  <h5>{game?.ended ? "Game Ended" : `Turn: ${currentTurn}`}</h5>
                  {game?.ended ? (
                    <button className="small mt-2" onClick={rematchGame}>Rematch</button>
                  ) : (
                    <button className="small mt-2" onClick={resignGame}>Resign</button>
                  )}
                </div>
                <div>
                  <Chessboard
                    boardWidth={boardWidth - 16}
                    position={game?.game.fen()}
                    onPieceDrop={onDrop}
                    boardOrientation={
                      game?.white === window.our.node ? "white" : "black"
                    }
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
