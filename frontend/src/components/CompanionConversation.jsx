import { Conversation } from '../companionConversation.js';
import { useChat } from '../hooks/useChat.js';
import { useSpeech } from '../hooks/useSpeech.js';
export function CompanionConversation({ children }) {
  const chat = useChat(), speech = useSpeech(chat.messages, chat.busy);
  return <Conversation.Provider value={{chat,speech}}>{children}</Conversation.Provider>;
}
