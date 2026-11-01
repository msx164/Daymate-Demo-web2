import { createContext, useContext } from 'react';
export const CharacterContext = createContext({ character: null, error: '', loading: false, busy: false, supported: false });
export const useCharacterResources = () => useContext(CharacterContext);
