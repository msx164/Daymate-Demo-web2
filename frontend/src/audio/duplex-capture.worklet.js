class DuplexCapture extends AudioWorkletProcessor {
  constructor(){super();this.buffer=new Float32Array(1024);this.length=0;}
  process(inputs,outputs){
    const input=inputs[0]?.[0];
    if(input)for(const value of input){this.buffer[this.length++]=value;if(this.length===1024){this.port.postMessage(this.buffer);this.buffer=new Float32Array(1024);this.length=0;}}
    for(const channel of outputs[0]||[])channel.fill(0);
    return true;
  }
}
registerProcessor('daymate-duplex-capture',DuplexCapture);
