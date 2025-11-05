// Shared numbering + preview generator used by wizard and workspace
// Models Kenya-style door numbering with blocks, phases-as-copies, floors, and doors.

export type AddressMode = 'simple' | 'block' | 'floor' | 'hybrid' | 'standalone';
export type NamingKind = 'numbers' | 'letters' | 'none' | 'custom';
export type DoorScheme = 'simple_numeric' | 'simple_alpha' | 'floor_numeric' | 'floor_alpha';

export interface NumberingConfig {
  addressType: AddressMode;
  // Floors
  floors: number;                 // number of floors above ground (>=0)
  includeGround: boolean;         // whether ground exists
  floorLabelKind: 'numeric' | 'alpha'; // how floors are shown/encoded when floor-based
  // Digit widths (apply only when the corresponding part is numeric)
  blockDigits?: number;
  phaseDigits?: number;
  floorDigits?: number;
  doorDigits?: number;
  // Doors
  doorScheme: DoorScheme;         // sequential or floor-based + numeric/alpha
  floorThreeDigit?: boolean;      // if floor_numeric, use 101.. vs 11
  groundStyle?: 'g' | '00';       // when numeric floors: g01 vs 001
  // Blocks
  hasBlocks?: boolean;            // UI toggle assistance
  blocksCount?: number;
  blockNaming?: NamingKind;       // letters | numbers | none | custom
  blockPrefix?: string;           // when custom
  blockLabelsCsv?: string;        // explicit labels override
  // Phases inside blocks (copies)
  hasPhases?: boolean;
  phaseSides?: number;            // >=1
  phaseNaming?: 'letters' | 'numbers' | 'none';
  phasesListCsv?: string;         // explicit labels override
}

export interface PreviewBlock {
  label: string; // block label ('' if none)
  sides?: string[]; // phase labels if any
  floors: Array<{ idx: number; label: string; cells: string[] | string[][] }>;
}

const alphaLabel = (n: number): string => {
  let x = n;
  let out = '';
  while (x > 0) { x--; out = String.fromCharCode(65 + (x % 26)) + out; x = Math.floor(x / 26); }
  return out;
};

const zeroPad = (n: number, w = 2) => String(n).padStart(w, '0');

function buildListFromCsv(csv?: string): string[] {
  const s = (csv || '').toString().trim();
  if (!s) return [];
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function buildBlocks(cfg: NumberingConfig): string[] {
  const explicit = buildListFromCsv(cfg.blockLabelsCsv);
  if (explicit.length > 0) return explicit;
  const count = Math.max(0, Number(cfg.blocksCount || 0));
  const naming = (cfg.blockNaming || 'letters');
  if (!cfg.hasBlocks && cfg.addressType !== 'block' && cfg.addressType !== 'hybrid') return [''];
  if (naming === 'none') return Array.from({ length: Math.max(1, count) }, () => '');
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    if (naming === 'numbers') {
      const d = Math.max(1, Number(cfg.blockDigits || 1));
      out.push(String(i + 1).padStart(d, '0'));
    }
    else if (naming === 'custom') out.push((cfg.blockPrefix || 'Block').toString());
    else out.push(String.fromCharCode('A'.charCodeAt(0) + i));
  }
  return out;
}

function buildPhases(cfg: NumberingConfig): string[] {
  if (!cfg.hasPhases && !cfg.phasesListCsv) return [];
  const explicit = buildListFromCsv(cfg.phasesListCsv);
  if (explicit.length > 0) return explicit;
  const n = Math.max(1, Number(cfg.phaseSides || 1));
  const naming = (cfg.phaseNaming || 'letters');
  if (naming === 'none') return Array.from({ length: n }, () => '');
  if (naming === 'numbers') {
    const d = Math.max(1, Number(cfg.phaseDigits || 1));
    return Array.from({ length: n }, (_, i) => String(i + 1).padStart(d, '0'));
  }
  return Array.from({ length: n }, (_, i) => String.fromCharCode('A'.charCodeAt(0) + i));
}

function floorLabels(cfg: NumberingConfig): Array<{ idx: number; label: string }> {
  const out: Array<{ idx: number; label: string }> = [];
  const total = Math.max(0, cfg.floors);
  if (total === 0) return out;
  if (cfg.includeGround) {
    // Total count includes ground. Example: total=4 => G,1,2,3 or A,B,C,D
    out.push({ idx: 0, label: cfg.floorLabelKind === 'alpha' ? 'A' : 'G' });
    for (let i = 1; i <= total - 1; i++) {
      let label: string;
      if (cfg.floorLabelKind === 'alpha') {
        label = alphaLabel(i + 1);
      } else {
        const d = Math.max(1, Number(cfg.floorDigits || 1));
        label = String(i).padStart(d, '0');
      }
      out.push({ idx: i, label });
    }
  } else {
    // No ground, count floors from 1..total (or A..)
    for (let i = 1; i <= total; i++) {
      const label = cfg.floorLabelKind === 'alpha'
        ? alphaLabel(i)
        : String(i).padStart(Math.max(1, Number(cfg.floorDigits || 1)), '0');
      out.push({ idx: i, label });
    }
  }
  return out;
}

export function generatePreview(cfg: NumberingConfig, unitsPerFloor: number): PreviewBlock[] {
  const blocks = buildBlocks(cfg);
  const phases = buildPhases(cfg);
  const flabels = floorLabels(cfg);

  // Determine sequencing rules
  const isSequential = cfg.doorScheme === 'simple_numeric' || cfg.doorScheme === 'simple_alpha';
  const doorAlpha = cfg.doorScheme === 'simple_alpha' || cfg.doorScheme === 'floor_alpha';
  const threeDigit = !!cfg.floorThreeDigit;
  const groundStyle = (cfg.groundStyle || 'g');

  const ascFloors = flabels.slice().sort((a, b) => (a.idx === 0 ? -0.5 : a.idx) - (b.idx === 0 ? -0.5 : b.idx));
  const seqDoorLabel = (floorAscIndex: number, unitIdx: number) => {
    const n = (floorAscIndex * unitsPerFloor) + (unitIdx + 1);
    if (doorAlpha) return alphaLabel(n);
    const dd = Math.max(1, Number(cfg.doorDigits || 1));
    return String(n).padStart(dd, '0');
  };

  const floorDoorLabel = (floorIdx: number, floorLabel: string, unitIdx: number) => {
    if (doorAlpha) {
      const door = alphaLabel(unitIdx + 1);
      if (cfg.floorLabelKind === 'alpha') return `${floorLabel}${door}`;
      if (floorIdx === 0) return `g${door}`; // numeric floors + alpha door
      return `${floorIdx}${door}`;
    }
    // numeric door
    if (cfg.floorLabelKind === 'alpha') {
      // A01, A02, ...
      const dd = Math.max(1, Number(cfg.doorDigits || 1));
      return `${floorLabel}${String(unitIdx + 1).padStart(dd, '0')}`;
    }
    // numeric floor labels
    if (floorIdx === 0) {
      const dd = Math.max(1, Number(cfg.doorDigits || 1));
      if (groundStyle === '00') return `${String(unitIdx + 1).padStart(Math.max(2, dd), '0')}`; // 001,002
      return `g${String(unitIdx + 1).padStart(dd, '0')}`; // g1,g2,g06
    }
    const fd = Math.max(1, Number(cfg.floorDigits || 1));
    const dd = Math.max(1, Number(cfg.doorDigits || 1));
    const floorPart = String(floorIdx).padStart(fd, '0');
    const doorPart = String(unitIdx + 1).padStart(dd, '0');
    return `${floorPart}${doorPart}`;
  };

  const compact = (...parts: string[]) => parts.join('').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  const buildSingleBlock = (blockLabel: string): PreviewBlock => {
    const floorsArr: Array<{ idx: number; label: string; cells: any } > = [];
    for (const f of flabels) {
      if (phases.length === 0) {
        const row: string[] = [];
        for (let u = 0; u < unitsPerFloor; u++) {
          const base = isSequential
            ? seqDoorLabel(ascFloors.findIndex(fl => fl.idx === f.idx), u)
            : floorDoorLabel(f.idx, f.label, u);
          row.push(compact(blockLabel, base));
        }
        floorsArr.push({ idx: f.idx, label: f.label, cells: row });
      } else {
        const row: string[][] = phases.map(() => []);
        for (let s = 0; s < phases.length; s++) {
          for (let u = 0; u < unitsPerFloor; u++) {
            const base = isSequential
              ? seqDoorLabel(ascFloors.findIndex(fl => fl.idx === f.idx), u)
              : floorDoorLabel(f.idx, f.label, u);
            // Encode block + phase + floor+door to match block:phase:floor:door
            row[s].push(compact(blockLabel, phases[s], base));
          }
        }
        floorsArr.push({ idx: f.idx, label: f.label, cells: row });
      }
    }
    // Sort display: top floors first, ground last
    floorsArr.sort((a: any, b: any) => {
      const av = a.idx === 0 ? -0.5 : a.idx;
      const bv = b.idx === 0 ? -0.5 : b.idx;
      return bv - av;
    });
    const out: PreviewBlock = { label: blockLabel, floors: floorsArr };
    if (phases.length > 0) out.sides = phases.map(p => p.toUpperCase());
    return out;
  };

  // Build per-block previews
  const list: PreviewBlock[] = (blocks.length > 0 ? blocks : ['']).map(b => buildSingleBlock(b || ''));

  // Only render as a simple 1..N list when:
  // - addressType is simple, AND
  // - door scheme is sequential (not floor-based), AND
  // - there are no blocks/phases, AND
  // - there are 0 floors (no G/1/2... context)
  // reuse isSequential from above
  const hasStructure = (cfg.hasBlocks || (buildPhases(cfg).length > 0) || floorLabels(cfg).length > 0);
  if (cfg.addressType === 'simple' && isSequential && !hasStructure) {
    const cells: string[] = [];
    const total = flabels.length * unitsPerFloor;
    const dd = Math.max(1, Number(cfg.doorDigits || 1));
    for (let i = 1; i <= Math.max(1, total); i++) {
      cells.push(doorAlpha ? alphaLabel(i) : String(i).padStart(dd, '0'));
    }
    return [{ label: '', floors: [{ idx: 0, label: '-', cells }] }];
  }

  if (cfg.addressType === 'standalone') {
    return [{ label: '', floors: [{ idx: 0, label: '-', cells: ['unit'] }] }];
  }

  return list;
}
