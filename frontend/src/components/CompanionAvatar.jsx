import { useState } from "react";
import day from "../assets/companion/day-v1.png";
import focused from "../assets/companion/day-focused-v1.png";
import speaking from "../assets/companion/day-speaking-v1.png";
import reading from '../assets/companion/day-reading-v1.png';
import working from '../assets/companion/day-working-v1.png';
import cleaning from '../assets/companion/day-cleaning-v1.png';
import dishes from '../assets/companion/day-dishes-v1.png';
import {dayActivityResource} from '../dayActivityAvatar.js';
import {ACTIVITIES} from '../companionActivities.js';
import { companionPresentation } from "../companionPresentation.js";
import { avatarResource } from "../characterResources.js";
import { useCharacterResources } from "../hooks/useCharacterResources.js";
import "./CompanionAvatar.css";

const images = { default: day, focused, speaking };
const activityImages={reading,working,cleaning,dishes};
function RobotFace({ expression }) {
  const restful = ["rest", "happy"].includes(expression);
  return <svg className="day-robot" viewBox="0 0 120 130" role="img" aria-label="Day 经典机器人">
    <path d="M60 24V12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0" fill="#e4dcff" stroke="#8068bd" strokeWidth="3" />
    <rect x="6" y="53" width="108" height="34" rx="10" fill="#d8d0ed" />
    <rect x="16" y="28" width="88" height="76" rx="24" fill="#f3f0fc" stroke="#9985c1" strokeWidth="3" />
    {restful ? <path d="M32 61q8-9 16 0m24 0q8-9 16 0" fill="none" stroke="#5c467c" strokeWidth="4" strokeLinecap="round" />
      : <g fill="#5c467c"><ellipse cx="40" cy="60" rx="5" ry={expression === "attentive" ? 5 : 7} /><ellipse cx="80" cy="60" rx="5" ry="7" /></g>}
    {expression === "talk" ? <ellipse cx="60" cy="83" rx="8" ry="7" fill="#8068a7" />
      : <path d={expression === "thoughtful" ? "M54 84h12" : "M48 80q12 12 24 0"} fill="none" stroke="#8068a7" strokeWidth="3" strokeLinecap="round" />}
    <ellipse cx="30" cy="78" rx="7" ry="4" fill="#efcbdc" /><ellipse cx="90" cy="78" rx="7" ry="4" fill="#efcbdc" />
    <path d="M38 108h44l6 16H32z" fill="#d8d0ed" />
  </svg>;
}

export function CompanionAvatar({ character = "day", portrait = false, state = "idle", motion = false, activity='idle' }) {
  const [failed, setFailed] = useState([]);
  const display = companionPresentation(state);
  const resources = useCharacterResources();
  const resource = dayActivityResource({character,state,activity,images:activityImages,failed}) || avatarResource({ character, pose: display.pose, custom: resources.character, images, failed });
  const cue=resource.activity?`${ACTIVITIES[resource.activity].label} · ${display.cue}`:display.cue;
  const { pose } = resource;
  return <span className={`day-avatar ${portrait ? "day-portrait" : "day-standing"}`}
    data-state={display.state} data-activity={resource.activity||'idle'} data-pose={pose} data-source={resource.source} data-expression={display.expression} data-motion={motion} title={cue}>
    <span className="day-figure" data-action={display.action} key={display.state}>
      {pose === "robot" ? <RobotFace expression={display.expression} />
        : <img key={resource.src} src={resource.src} alt={`${resource.name} 的 2D 插画形象 · ${cue}`}
          onError={() => setFailed(previous => previous.includes(resource.src) ? previous : [...previous, resource.src])} draggable="false" />}
    </span>
    {!portrait && <span className="day-cue" aria-hidden="true">{display.symbol}</span>}
  </span>;
}
