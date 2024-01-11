import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface Game {
  id: string,
  turns: number,
  board: string, // FEN format of the board
  white: string,
  black: string,
  ended: boolean,
}

export interface Games {
  [id: string]: Game
}

export interface ChessStore {
  games: Games
  handleWsMessage: (message: string) => void
  set: (partial: ChessStore | Partial<ChessStore>) => void
}

type WsMessage = { kind: 'game_update', data: Game }

const useChessStore = create<ChessStore>()(
  persist(
    (set, get) => ({
      games: {},
      handleWsMessage: (json: string | Blob) => {
        if (typeof json === 'string') {
          try {
            const { kind, data } = JSON.parse(json) as WsMessage;
            if (kind === 'game_update') {
              set({ games: { ...get().games, [data.id]: data } })
            }
          } catch (error) {
            console.error("Error parsing WebSocket message", error);
          }
        } else {
          const reader = new FileReader();

          reader.onload = function(event) {
            if (typeof event?.target?.result === 'string') {
              try {
                const { kind, data } = JSON.parse(event.target.result) as WsMessage;

                if (kind === 'game_update') {
                  set({ games: { ...get().games, [data.id]: data } })
                }
              } catch (error) {
                console.error("Error parsing WebSocket message", error);
              }
            }
          };

          reader.readAsText(json);
        }
      },
      set,
    }),
    {
      name: 'chess', // unique name
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
    }
  )
)

export default useChessStore
