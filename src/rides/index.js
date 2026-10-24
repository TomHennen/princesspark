// Ride registry + park layout. Every ride's plot (centre, yaw, approx footprint) is decided HERE.
// World builder keeps these plots clear. Park is ~260x260 centred on origin; castle at the north (−Z), entrance at the south (+Z).
import * as THREE from 'three';
import { Coaster } from './coaster.js';
import { LogFlume } from './logflume.js';
import { Carousel } from './carousel.js';
import { FerrisWheel } from './ferris.js';
import { Teacups } from './teacups.js';
import { LightCycle } from './lightcycle.js';
import { Motorcycle } from './motorcycle.js';
import { WaterSlide } from './waterslide.js';
import { LazyRiver } from './lazyriver.js';

// footprint is the (x,z) size of the plot the ride may use, centred on position.
export const LAYOUT = {
  coaster:    { position: new THREE.Vector3(-78, 0, -30), rotationY: 0,            footprint: [70, 60] },
  logflume:   { position: new THREE.Vector3(78, 0, -30),  rotationY: 0,            footprint: [60, 60] },
  carousel:   { position: new THREE.Vector3(-30, 0, 30),  rotationY: 0,            footprint: [26, 26] },
  ferris:     { position: new THREE.Vector3(30, 0, 30),   rotationY: Math.PI / 2,  footprint: [20, 30] },
  teacups:    { position: new THREE.Vector3(0, 0, 70),    rotationY: 0,            footprint: [26, 26] },
  lightcycle: { position: new THREE.Vector3(-80, 0, 70),  rotationY: 0,            footprint: [60, 60] },
  motorcycle: { position: new THREE.Vector3(80, 0, 70),   rotationY: 0,            footprint: [60, 60] },
  // Water park (east wing, x 120..200). Entering the wing (x > WATER_PARK.minX) swaps the avatar into a swimsuit.
  waterslide: { position: new THREE.Vector3(160, 0, -30), rotationY: 0,            footprint: [60, 60] },
  lazyriver:  { position: new THREE.Vector3(160, 0, 45),  rotationY: 0,            footprint: [64, 64] },
};
export const WATER_PARK = { minX: 122, maxX: 200, minZ: -70, maxZ: 85, gate: new THREE.Vector3(122, 0, 8) };

export function createRides(game) {
  const L = (id) => ({ id, ...LAYOUT[id] });
  return [
    new Coaster(game, L('coaster')),
    new LogFlume(game, L('logflume')),
    new Carousel(game, L('carousel')),
    new FerrisWheel(game, L('ferris')),
    new Teacups(game, L('teacups')),
    new LightCycle(game, L('lightcycle')),
    new Motorcycle(game, L('motorcycle')),
    new WaterSlide(game, L('waterslide')),
    new LazyRiver(game, L('lazyriver')),
  ];
}
