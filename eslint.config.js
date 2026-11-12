import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';

/**
 * Layer boundaries (see docs/ARCHITECTURE.md):
 *   config      → nothing
 *   core        → config            (no three)
 *   simulation  → core, config      (no three)
 *   rendering   → core, config, three
 *   world/vehicles/fx → rendering, core, config, simulation (read-only data)
 *   systems     → simulation, world, vehicles, fx, rendering, core, config
 *   ui          → core, config      (never systems / rendering)
 *   app         → everything
 */
const noThree = {
  group: ['three', 'three/*'],
  message: 'This layer must stay framework-agnostic (no three.js imports).',
};
const layer = (dir) => ({ group: [`**/${dir}/*`, `**/${dir}/**`] });

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { import: importPlugin },
    settings: { 'import/resolver': { node: { extensions: ['.js'] } } },
    rules: {
      'import/no-unresolved': ['error', { ignore: ['^three/', '^vite$'] }],
      'import/named': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/config/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [noThree, layer('core'), layer('simulation'), layer('rendering'), layer('world'), layer('systems'), layer('ui'), layer('app'), layer('fx'), layer('vehicles')] },
      ],
    },
  },
  {
    files: ['src/core/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [noThree, layer('simulation'), layer('rendering'), layer('world'), layer('systems'), layer('ui'), layer('app'), layer('fx'), layer('vehicles')] },
      ],
    },
  },
  {
    files: ['src/simulation/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [noThree, layer('rendering'), layer('world'), layer('systems'), layer('ui'), layer('app'), layer('fx'), layer('vehicles')] },
      ],
    },
  },
  {
    files: ['src/rendering/**/*.js', 'src/world/**/*.js', 'src/vehicles/**/*.js', 'src/fx/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [layer('systems'), layer('ui'), layer('app')] },
      ],
    },
  },
  {
    files: ['src/ui/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [layer('systems'), layer('simulation'), layer('world'), layer('app'), layer('fx'), layer('vehicles')] },
      ],
    },
  },
];
