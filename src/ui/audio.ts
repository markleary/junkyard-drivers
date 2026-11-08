/** Original synthesized engine and UI sounds. No network or licensed recordings. */
export class GameAudio {
  private context?:AudioContext;
  private oscillator?:OscillatorNode;
  private gain?:GainNode;
  muted=false;
  start() {
    if(!this.context) {
      this.context=new AudioContext();
      this.oscillator=this.context.createOscillator();this.oscillator.type='sawtooth';
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=320;
      this.gain=this.context.createGain();this.gain.gain.value=0;
      this.oscillator.connect(filter).connect(this.gain).connect(this.context.destination);this.oscillator.start();
    }
    void this.context.resume();
  }
  update(speed:number,driving:boolean,throttle:boolean) {
    if(!this.context||!this.gain||!this.oscillator)return;
    this.oscillator.frequency.setTargetAtTime(32+Math.abs(speed)*3+(throttle?15:0),this.context.currentTime,.12);
    this.gain.gain.setTargetAtTime(driving&&!this.muted?.035:0,this.context.currentTime,.12);
  }
  click() {
    if(!this.context||this.muted)return;
    const osc=this.context.createOscillator(), gain=this.context.createGain();
    osc.connect(gain).connect(this.context.destination);osc.frequency.value=650;
    gain.gain.setValueAtTime(.045,this.context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,this.context.currentTime+.1);
    osc.start();osc.stop(this.context.currentTime+.1);
  }
}
