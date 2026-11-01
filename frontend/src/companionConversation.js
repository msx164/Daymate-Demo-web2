import { createContext, useContext } from 'react';
export const Conversation = createContext(null);
export function useConversation() { return useContext(Conversation); }
