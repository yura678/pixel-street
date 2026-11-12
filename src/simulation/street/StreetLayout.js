/**
 * The street layout: a hand-made 240-metre loop (12 chunks of 20 m) of lots along the right
 * side of the road, in the order the taxi drives them. Every house lot names its
 * `BuildingSpec` (`src/config/buildings/`); the open lots are the garden of № 114 with Bus
 * Stop #1 (Z 40–60 m), the service alley (Z 106.5–112.5 m), the pocket square (Z 147.5–153.5 m)
 * and the town hall's Bus Stop #2. The loop closes between № 166 (Z 240 m) and № 100 (Z 0).
 * No `three` import: the layout is plain data.
 */
import { CHUNK_LENGTH } from '../../config/constants.js';

export const LotType = Object.freeze({
  SHOP: 'shop',
  HOUSE: 'house',
  ALLEY: 'alley',
  PARK: 'park',
  BUS_STOP: 'busStop',
});

export const TOTAL_LOOP_CHUNKS = 12;
export const LOOP_LENGTH = TOTAL_LOOP_CHUNKS * CHUNK_LENGTH; // 240.0 m

/**
 * 12 static chunk templates defining the 240-metre right-side building row.
 * Each chunk spans exactly 20.0 metres. `spec` – the house standing on the lot; `hasLamp`,
 * `hasTree`, `hasBicycle` – the sidewalk furniture in front of it.
 */
const STATIC_CHUNKS_RIGHT = [
  // Chunk 0 (0.0 - 20.0 m): Morning Bakery & Promenade
  [
    {
      relZ0: 0.0,
      relZ1: 6.5,
      type: LotType.SHOP,
      // № 100 Second Empire with the café (the loop's seam: № 166 stands before it)
      spec: 'no100',
      hasBicycle: true,
      bicycleVariant: 0,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 6.5,
      relZ1: 13.0,
      type: LotType.SHOP,
      // № 102 Anglo-Italianate with the news kiosk
      spec: 'no102',
      hasBicycle: false,
      hasLamp: false,
      hasTree: true,
    },
    {
      relZ0: 13.0,
      relZ1: 20.0,
      type: LotType.HOUSE,
      // № 104 Romanesque Revival, rock-faced
      spec: 'no104',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
  ],

  // Chunk 1 (20.0 - 40.0 m): Books, Florist & Grand Pre-Park Corner
  [
    {
      relZ0: 0.0,
      relZ1: 6.5,
      type: LotType.SHOP,
      // № 106 Dutch Revival with a neck gable, the bookshop
      spec: 'no106',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
    {
      relZ0: 6.5,
      relZ1: 13.5,
      type: LotType.SHOP,
      // № 108 Italianate with the florist
      spec: 'no108',
      hasBicycle: true,
      bicycleVariant: 1,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 13.5,
      relZ1: 20.0,
      type: LotType.HOUSE,
      // № 110 Greek Revival, its flank over the garden of № 114
      spec: 'no110',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
  ],

  // Chunk 2 (40.0 - 60.0 m): Central City Park & Bus Stop #1
  [
    {
      relZ0: 0.0,
      relZ1: 12.8,
      type: LotType.PARK,
      spec: 'no114',
      hasTree: true,
      hasLamp: false, // the garden has its own lamp behind the railing
      hasBicycle: false,
    },
    {
      relZ0: 12.8,
      relZ1: 20.0,
      type: LotType.BUS_STOP,
      backdrop: 'park',
      hasTree: false,
      hasLamp: true,
      hasBicycle: false,
    },
  ],

  // Chunk 3 (60.0 - 80.0 m): Ramen Bar, Corner Convenience & Residence
  [
    {
      relZ0: 0.0,
      relZ1: 9.6,
      type: LotType.SHOP,
      spec: 'no118',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 9.6,
      relZ1: 15.2,
      type: LotType.SHOP,
      spec: 'no120',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
    {
      relZ0: 15.2,
      relZ1: 20.0,
      type: LotType.HOUSE,
      spec: 'no122',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
  ],

  // Chunk 4 (80.0 - 100.0 m): Vinyl Records, Pizzeria & Industrial Workshop
  [
    {
      relZ0: 0.0,
      relZ1: 6.5,
      type: LotType.SHOP,
      spec: 'no124',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
    {
      relZ0: 6.5,
      relZ1: 13.5,
      type: LotType.SHOP,
      spec: 'no126',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 13.5,
      relZ1: 20.0,
      type: LotType.SHOP,
      // № 128 bike workshop (open, a bike on the rack out front)
      spec: 'no128',
      hasBicycle: true,
      bicycleVariant: 0,
      hasLamp: false,
      hasTree: false,
    },
  ],

  // Chunk 5 (100.0 - 120.0 m): Barber, Clean Open Alleyway & Arcade
  [
    {
      relZ0: 0.0,
      relZ1: 6.5,
      type: LotType.SHOP,
      // № 130 Dutch Revival barber shop
      spec: 'no130',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 6.5,
      relZ1: 12.5,
      type: LotType.ALLEY,
      hasTree: false,
      hasLamp: false,
      hasBicycle: false,
    },
    {
      relZ0: 12.5,
      relZ1: 20.0,
      type: LotType.SHOP,
      // № 132 tenement with the arcade
      spec: 'no132',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
  ],

  // Chunk 6 (120.0 - 140.0 m): Laundromat, Townhouse & Tea Salon
  [
    {
      relZ0: 0.0,
      relZ1: 7.0,
      type: LotType.SHOP,
      // № 134 Commercial-style laundromat
      spec: 'no134',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
    {
      relZ0: 7.0,
      relZ1: 14.0,
      type: LotType.HOUSE,
      // № 136 Italianate brownstone
      spec: 'no136',
      hasBicycle: false,
      hasLamp: true,
      hasTree: true,
    },
    {
      relZ0: 14.0,
      relZ1: 20.0,
      type: LotType.SHOP,
      // № 138 Greek Revival tea salon
      spec: 'no138',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
  ],

  // Chunk 7 (140.0 - 160.0 m): Art Gallery, Civic Plaza & Bus Stop #2
  [
    {
      relZ0: 0.0,
      relZ1: 7.5,
      type: LotType.SHOP,
      // № 140 Renaissance Revival gallery
      spec: 'no140',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 7.5,
      relZ1: 13.5,
      type: LotType.PARK,
      hasTree: true,
      hasLamp: true,
      hasBicycle: false,
    },
    {
      relZ0: 13.5,
      relZ1: 20.0,
      type: LotType.BUS_STOP,
      backdrop: 'town_hall',
      // № 142 the town hall, the bus stop at the curb in front
      spec: 'no142',
      hasTree: false,
      hasLamp: true,
      hasBicycle: false,
    },
  ],

  // Chunk 8 (160.0 - 180.0 m): Town Hall Annex / Apothecary, Hotel Metropole & Parisian Bistro
  [
    {
      relZ0: 0.0,
      relZ1: 6.5,
      type: LotType.SHOP,
      // № 144 the town hall annex with the post office
      spec: 'no144',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
    {
      relZ0: 6.5,
      relZ1: 13.5,
      type: LotType.HOUSE,
      // № 146 Hotel Metropole
      spec: 'no146',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 13.5,
      relZ1: 20.0,
      type: LotType.SHOP,
      // № 148 Parisian bistro in a cast-iron front
      spec: 'no148',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
  ],

  // Chunk 9 (180.0 - 200.0 m): Antique Horology, Residence & Evening Neon
  [
    {
      relZ0: 0.0,
      relZ1: 7.0,
      type: LotType.SHOP,
      // № 150 the clockmaker in a Romanesque Revival house
      spec: 'no150',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 7.0,
      relZ1: 14.0,
      type: LotType.HOUSE,
      // № 152 Federal rowhouse
      spec: 'no152',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
    {
      relZ0: 14.0,
      relZ1: 20.0,
      type: LotType.SHOP,
      // № 154 tenement with the neon bar
      spec: 'no154',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
  ],

  // Chunk 10 (200.0 - 220.0 m): Burger Bar, Ceramics Studio & Townhouse
  [
    {
      relZ0: 0.0,
      relZ1: 7.0,
      type: LotType.SHOP,
      // № 156 Italianate with the 1950s burger bar
      spec: 'no156',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
    {
      relZ0: 7.0,
      relZ1: 14.0,
      type: LotType.SHOP,
      // № 158 the potter's studio in a former carriage house
      spec: 'no158',
      hasBicycle: false,
      hasLamp: true,
      hasTree: true,
    },
    {
      relZ0: 14.0,
      relZ1: 20.0,
      type: LotType.HOUSE,
      // № 160 Queen Anne townhouse
      spec: 'no160',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
  ],

  // Chunk 11 (220.0 - 240.0 m): Print Shop, Pharmacy & Seamless Looping Townhouse
  [
    {
      relZ0: 0.0,
      relZ1: 7.0,
      type: LotType.SHOP,
      // № 162 the printer's in a 1930s taxpayer
      spec: 'no162',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
    {
      relZ0: 7.0,
      relZ1: 13.5,
      type: LotType.SHOP,
      // № 164 Italianate of painted brick with the pharmacy
      spec: 'no164',
      hasBicycle: false,
      hasLamp: false,
      hasTree: false,
    },
    {
      // № 166 Neo-Grec, where the loop closes (its right neighbour is № 100 in chunk 0)
      relZ0: 13.5,
      relZ1: 20.0,
      type: LotType.HOUSE,
      spec: 'no166',
      hasBicycle: false,
      hasLamp: true,
      hasTree: false,
    },
  ],
];

export class StreetLayout {
  /**
   * The right-hand lots on either side of lot `i` of a chunk. At the chunk's ends they come from
   * the chunks before and after – across the loop's seam too: the lot before chunk 0's first is
   * chunk 11's last (№ 166) and the lot after chunk 11's last is chunk 0's first (№ 100).
   * @param {{ chunkIndex: number, right: object[] }} chunk a layout from `getChunk`
   * @param {number} i
   * @param {import('../../core/Store.js').Store} [store]
   * @returns {{ prev: object | null, next: object | null }}
   */
  static neighbourLots(chunk, i, store) {
    const lots = chunk.right;
    const prev =
      i > 0
        ? lots[i - 1]
        : (StreetLayout.getChunk(chunk.chunkIndex - 1, store).right.slice(-1)[0] ?? null);
    const next =
      i < lots.length - 1
        ? lots[i + 1]
        : (StreetLayout.getChunk(chunk.chunkIndex + 1, store).right[0] ?? null);
    return { prev, next };
  }

  /**
   * The lots of a single chunk (the loop repeats every `TOTAL_LOOP_CHUNKS` chunks).
   * @param {number} chunkIndex
   * @param {import('../../core/Store.js').Store} [_store]
   * @returns {{ chunkIndex: number, zStart: number, zEnd: number, right: object[] }}
   */
  static getChunk(chunkIndex, _store) {
    const zStart = chunkIndex * CHUNK_LENGTH;
    const zEnd = zStart + CHUNK_LENGTH;

    const cycleIndex = ((chunkIndex % TOTAL_LOOP_CHUNKS) + TOTAL_LOOP_CHUNKS) % TOTAL_LOOP_CHUNKS;
    const right = STATIC_CHUNKS_RIGHT[cycleIndex].map((tpl, i) => {
      const z0 = zStart + tpl.relZ0;
      const z1 = zStart + tpl.relZ1;
      return {
        id: `${chunkIndex}_right_${i}`,
        type: tpl.type,
        side: 'right',
        zStart: z0,
        zEnd: z1,
        width: z1 - z0,
        centerZ: (z0 + z1) * 0.5,
        hasTree: tpl.hasTree ?? false,
        hasLamp: tpl.hasLamp ?? false,
        hasBicycle: tpl.hasBicycle ?? false,
        bicycleVariant: tpl.bicycleVariant ?? 0,
        backdrop: tpl.backdrop ?? null,
        // Building specification id (`src/config/buildings/`); null on open lots
        spec: tpl.spec ?? null,
      };
    });

    return { chunkIndex, zStart, zEnd, right };
  }
}
