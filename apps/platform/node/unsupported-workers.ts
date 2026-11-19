/** Import boundary only. No Durable Object emulation or production scheduling. */
export class DurableObject {
  constructor() {
    throw new Error('Durable Objects are unavailable in the Node foundation proof');
  }
}
