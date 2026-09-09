import './localization';
import options from './options';
import { registerServiceWorker } from './registerServiceWorker';
import { Roulette } from './roulette';
import { RaceSimulator } from './simulation';
import { AppUI } from './ui/app';

registerServiceWorker();

const roulette = new Roulette();
const simulator = new RaceSimulator();

(window as any).roulette = roulette;
(window as any).options = options;
(window as any).raceSimulator = simulator;

// The pre-simulation needs its own physics world; warm it up while the user is
// still typing names so starting a race never has to wait for it.
simulator.init().catch((err) => {
  console.error('failed to initialize the race simulator', err);
});

function waitForRoulette() {
  if (!roulette.isReady) {
    setTimeout(waitForRoulette, 100);
    return;
  }
  new AppUI(roulette, simulator).start();
}

document.addEventListener('DOMContentLoaded', waitForRoulette);
