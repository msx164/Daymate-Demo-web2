const smooth = value => { const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x); };
// Shared by joints and props. Deliberate pauses prevent continuous metronomic waving.
export function activityRhythm(seconds, animated) {
  const t=animated&&Number.isFinite(seconds)?Math.max(0,seconds):0;
  const page=t%14;
  const turn=smooth((page-11)/.7)*(1-smooth((page-12)/.7));
  const typing=smooth((Math.sin(t*.78)+.2)/.5);
  const blinkPhase=t%4.9;
  const blink=animated?Math.max(0,1-Math.abs(blinkPhase-4.25)/.15):0;
  return { t, turn, typing, blink, scan:Math.sin(t*.55), slow:Math.sin(t*.38),
    sweep:Math.sin(t*.85)*(.85+.15*Math.cos(t*.21)),
    wash:Math.sin(t*1.9),washY:Math.cos(t*1.9),keys:Math.sin(t*5.4)*typing };
}
