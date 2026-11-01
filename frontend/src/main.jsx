import { AuthGate } from './web2/AuthGate.jsx';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { PetWindow } from "./components/PetWindow.jsx";
import { CharacterResources } from "./components/CharacterResources.jsx";
import { CompanionConversation } from './components/CompanionConversation.jsx';
import "./index.css";
import "./web2/Brand.css";

const rootElement = document.getElementById("root");
const petWindow = !!window.daymatePet || new URLSearchParams(window.location.search).get("view") === "pet";
if (petWindow) document.documentElement.classList.add("pet-window");

console.log("Daymate main.jsx 已加载", rootElement);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthGate><CharacterResources>{petWindow ? window.daymatePet ? <PetWindow /> : <p className="pet-error">桌宠连接不可用，请从桌面版重新打开。</p> : <CompanionConversation><App /></CompanionConversation>}</CharacterResources></AuthGate>
  </React.StrictMode>
);
