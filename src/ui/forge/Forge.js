/**
 * Forge – the side panel (lil-gui) with every parameter of `params.schema.js` (Stage 8 of
 * `IMPLEMENTATION_PLAN.md`).
 *
 * The panel talks only to the Store: a control writes its key (source 'forge'), and every change
 * in the Store – a weather preset, the URL, an import, the auto weather cycle – updates the
 * control showing that key. The systems subscribed to their keys do the rest (uniforms,
 * rebuilds), so the panel never touches the scene.
 *
 *  - Parameters that rebuild geometry (`rebuild` in the schema: the seed, tree density, draw
 *    distance…) are written when the slider is released, not on every step of a drag.
 *  - Parameters marked `pending` are shown disabled, with the stage that will wire them up.
 *  - Presets: a name field and the presets saved in this browser (`PresetLibrary`), Save / Load
 *    / Delete, Export / Import JSON, Randomize world, Reset to defaults and Screenshot. Every
 *    button also goes out on the bus (`Events.FORGE_ACTION`): the App saves the screenshot.
 *  - On a phone (narrow screen or coarse pointer) the panel starts collapsed; `forge.css` gives
 *    it 36 px rows and at most 85 % of the screen's width.
 */
import GUI from 'lil-gui';
import { Events } from '../../core/EventBus.js';
import { PARAM_FOLDERS } from '../../config/params.schema.js';
import { applyPreset, cleanPresetName, parsePreset, stringifyPreset } from './presetStorage.js';
import { controlOf, fileSlug, randomSeed, randomWorld } from './forgeModel.js';
import { downloadText, pickTextFile } from '../download.js';

/** Shown in the saved-presets list when there are none. */
const NONE = '—';
/** A status message fades after this long (ms). */
const STATUS_MS = 4000;

/** True on a phone-sized screen or a touch-only device. */
export function isCompactScreen() {
  return globalThis.matchMedia?.('(max-width: 720px), (pointer: coarse)').matches ?? false;
}

export class Forge {
  /** @type {import('../../core/Store.js').Store} */
  #store;
  /** @type {import('../../core/EventBus.js').EventBus} */
  #bus;
  /** @type {import('./presetStorage.js').PresetLibrary} */
  #library;
  /** @type {GUI} */
  #gui;
  /** Values lil-gui edits: a copy of the store, kept in step with it. */
  #values;
  /** @type {Map<string, import('lil-gui').Controller>} */
  #controllers = new Map();
  /** Preset fields that are not parameters. */
  #presetUi = { name: '', saved: NONE };
  /** @type {import('lil-gui').Controller | null} */
  #nameCtrl = null;
  /** @type {import('lil-gui').Controller | null} */
  #savedCtrl = null;
  /** @type {HTMLElement} */
  #statusEl;
  #statusTimer = 0;
  #off;

  /**
   * @param {object} options
   * @param {import('../../core/Store.js').Store} options.store
   * @param {import('../../core/EventBus.js').EventBus} options.bus
   * @param {import('./presetStorage.js').PresetLibrary} options.library
   * @param {readonly any[]} [options.folders=PARAM_FOLDERS]
   * @param {boolean} [options.collapsed] start collapsed (default: on a phone)
   */
  constructor({ store, bus, library, folders = PARAM_FOLDERS, collapsed = isCompactScreen() }) {
    this.#store = store;
    this.#bus = bus;
    this.#library = library;
    this.#values = store.snapshot();

    this.#gui = new GUI({ title: 'Forge' });
    this.#gui.domElement.classList.add('forge');
    this.#statusEl = document.createElement('div');
    this.#statusEl.className = 'forge-status';
    this.#statusEl.setAttribute('role', 'status');

    for (const folder of folders) {
      const gui = this.#gui.addFolder(folder.name);
      if (!folder.open) gui.close();
      if (folder.name === 'Presets') this.#addPresetFields(gui);
      for (const item of folder.items) {
        if (item.type === 'action') this.#addAction(gui, item);
        else this.#addParam(gui, item);
      }
      if (folder.name === 'Presets') gui.$children.append(this.#statusEl);
    }
    if (collapsed) this.#gui.close();

    this.#off = store.subscribe('*', (keys) => {
      for (const key of keys) {
        const ctrl = this.#controllers.get(key);
        if (!ctrl) continue;
        this.#values[key] = store.get(key);
        ctrl.updateDisplay();
      }
    });
  }

  /** The panel's root element. */
  get domElement() {
    return this.#gui.domElement;
  }

  /** @param {boolean} [show=true] */
  show(show = true) {
    this.#gui.show(show);
  }

  dispose() {
    clearTimeout(this.#statusTimer);
    this.#off();
    this.#gui.destroy();
  }

  /**
   * @param {GUI} gui
   * @param {any} def
   */
  #addParam(gui, def) {
    const spec = controlOf(def);
    let ctrl;
    if (spec.kind === 'slider') ctrl = gui.add(this.#values, def.key, def.min, def.max, def.step);
    else if (spec.kind === 'dropdown') ctrl = gui.add(this.#values, def.key, [...def.options]);
    else if (spec.kind === 'color') ctrl = gui.addColor(this.#values, def.key);
    else ctrl = gui.add(this.#values, def.key);
    ctrl.name(spec.label);
    ctrl.domElement.title = spec.title;
    const write = (value) => this.#store.set(def.key, value, 'forge');
    if (spec.applyOn === 'release') ctrl.onFinishChange(write);
    else ctrl.onChange(write);
    if (spec.disabled) ctrl.disable();
    this.#controllers.set(def.key, ctrl);
  }

  /**
   * @param {GUI} gui
   * @param {{ id: string, label: string }} item
   */
  #addAction(gui, { id, label }) {
    gui.add({ [id]: () => this.#run(id) }, id).name(label);
  }

  /** The name to save under and the list of presets saved in this browser. @param {GUI} gui */
  #addPresetFields(gui) {
    this.#nameCtrl = gui.add(this.#presetUi, 'name').name('Name');
    this.#savedCtrl = gui.add(this.#presetUi, 'saved', [NONE]).name('Saved');
    this.#refreshSaved();
  }

  /** @param {string} name shown in the name field */
  #setName(name) {
    this.#presetUi.name = name;
    this.#nameCtrl?.updateDisplay();
  }

  /**
   * Rebuild the saved-presets list, selecting `select` if given.
   * @param {string} [select]
   */
  #refreshSaved(select) {
    const names = this.#library.names();
    const old = this.#savedCtrl;
    if (!old) return;
    this.#presetUi.saved = names.includes(select) ? select : (names[0] ?? NONE);
    // `options()` replaces the controller; keep the new one where the old one stood
    const parent = old.parent;
    const next = old.domElement.nextSibling;
    const ctrl = old.options(names.length ? names : [NONE]);
    if (next) parent.$children.insertBefore(ctrl.domElement, next);
    ctrl.domElement.title = this.#library.available
      ? 'Presets saved in this browser'
      : 'This browser does not let the page keep presets';
    this.#savedCtrl = ctrl;
  }

  /** @param {string} id */
  #run(id) {
    const store = this.#store;
    switch (id) {
      case 'randomSeed':
        store.set('street.seed', randomSeed(), 'forge');
        break;
      case 'savePreset':
        this.#save();
        break;
      case 'loadPreset':
        this.#load();
        break;
      case 'deletePreset':
        this.#delete();
        break;
      case 'exportJson':
        this.#export();
        break;
      case 'importJson':
        this.#import();
        break;
      case 'randomize':
        applyPreset(store, randomWorld(), 'forge');
        this.#status(`Seed ${store.get('street.seed')}, ${store.get('weather.preset')}`);
        break;
      case 'resetAll':
        store.reset('*', 'reset');
        this.#status('Every parameter is back to its default');
        break;
      case 'screenshot':
        this.#status('Saving the next frame as PNG…');
        break;
    }
    this.#bus.emit(Events.FORGE_ACTION, { id });
  }

  #save() {
    const name = cleanPresetName(this.#presetUi.name);
    if (!name) return this.#status('Type a name for the preset first', true);
    const existed = this.#library.get(name) !== null;
    const saved = this.#library.save(name, this.#store.snapshot());
    if (!saved) return this.#status('This browser does not let the page keep presets', true);
    this.#setName(saved);
    this.#refreshSaved(saved);
    this.#status(existed ? `Updated “${saved}”` : `Saved “${saved}”`);
  }

  #load() {
    const name = this.#presetUi.saved;
    const params = name === NONE ? null : this.#library.get(name);
    if (!params) return this.#status('No saved preset to load', true);
    const { rejected } = applyPreset(this.#store, params, 'preset-load');
    this.#setName(name);
    this.#status(`Loaded “${name}”${rejected.length ? ` (${rejected.length} skipped)` : ''}`);
  }

  #delete() {
    const name = this.#presetUi.saved;
    if (name === NONE || !this.#library.remove(name)) {
      return this.#status('No saved preset to delete', true);
    }
    this.#refreshSaved();
    this.#status(`Deleted “${name}”`);
  }

  #export() {
    const name = cleanPresetName(this.#presetUi.name) || this.#store.get('weather.preset');
    downloadText(
      stringifyPreset(name, this.#store.snapshot()),
      `pixel-street_${fileSlug(name)}.json`,
    );
    this.#status(`Exported “${name}”`);
  }

  async #import() {
    const text = await pickTextFile();
    if (text === null) return;
    const parsed = parsePreset(text);
    if (!parsed.ok) return this.#status(`Import failed: ${parsed.error}`, true);
    const { applied, rejected } = applyPreset(this.#store, parsed.params, 'import');
    if (parsed.name) {
      this.#setName(parsed.name);
    }
    this.#status(
      `Imported ${parsed.name ? `“${parsed.name}”` : 'parameters'}: ${applied.length} changed` +
        (rejected.length ? `, ${rejected.length} skipped` : ''),
      rejected.length > 0,
    );
  }

  /**
   * @param {string} text
   * @param {boolean} [warn=false]
   */
  #status(text, warn = false) {
    this.#statusEl.textContent = text;
    this.#statusEl.classList.toggle('is-warning', warn);
    this.#statusEl.classList.add('is-visible');
    clearTimeout(this.#statusTimer);
    this.#statusTimer = setTimeout(() => this.#statusEl.classList.remove('is-visible'), STATUS_MS);
  }
}
