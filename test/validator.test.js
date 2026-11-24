const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SailValidator,
  UpdateValidator,
  StatusValidator,
  StateValidator,
} = require('../validator.js');

const pluginFactory = require('../index');
const { createApp } = require('./support/stubs');

// The sail types offered by the plugin settings are the reference: every one
// of them has to pass the API validation as well.
const SAIL_TYPES = pluginFactory(createApp()).schema.properties.sails.items.properties.type.enum;

function sail(overrides) {
  return Object.assign(
    {
      id: 'storm',
      name: 'Storm Jib',
      description: 'The heavy weather jib',
      type: 'jib',
      material: 'dacron',
      brand: 'Elvstrom',
      active: false,
      area: 12,
      minimumWind: 10,
      maximumWind: 40,
      reefs: [],
      continuousReefing: false,
      reducedState: { reefs: 0 },
    },
    overrides
  );
}

describe('SailValidator', () => {
  const validator = new SailValidator();

  it('accepts a complete sail with fixed reefs', () => {
    assert.deepEqual(validator.validate(sail({ reefs: [8, 4] })), {});
  });

  it('accepts a continuously reefing sail', () => {
    assert.deepEqual(
      validator.validate(sail({ continuousReefing: true, reducedState: { furledRatio: 0.5 } })),
      {}
    );
  });

  it('accepts every documented sail type', () => {
    SAIL_TYPES.forEach((type) => {
      assert.deepEqual(validator.validate(sail({ type })), {}, `${type} should be valid`);
    });
  });

  it('rejects an unknown sail type', () => {
    assert.match(validator.validate(sail({ type: 'kite' })).type, /Sail type must be one of/);
  });

  it('rejects an id that is missing or malformed', () => {
    assert.ok(validator.validate(sail({ id: undefined })).id);
    assert.ok(validator.validate(sail({ id: '' })).id);
    assert.match(validator.validate(sail({ id: 'storm_jib!' })).id, /unique sail ID/);
  });

  it('rejects a name that is too short or contains special characters', () => {
    assert.match(validator.validate(sail({ name: 'S' })).name, /at least 2 characters/);
    assert.match(validator.validate(sail({ name: 'Storm#Jib' })).name, /valid name/);
  });

  it('rejects overlong free text fields', () => {
    assert.match(
      validator.validate(sail({ description: 'x'.repeat(201) })).description,
      /200 characters/
    );
    assert.match(validator.validate(sail({ material: 'x'.repeat(51) })).material, /50 characters/);
    assert.match(validator.validate(sail({ brand: 'x'.repeat(51) })).brand, /50 characters/);
  });

  it('rejects a missing or non positive area', () => {
    assert.match(validator.validate(sail({ area: undefined })).area, /cannot be undefined/);
    assert.match(validator.validate(sail({ area: 0 })).area, /cannot be negative/);
    assert.match(validator.validate(sail({ area: -1 })).area, /cannot be negative/);
  });

  it('rejects negative wind limits', () => {
    assert.match(validator.validate(sail({ minimumWind: -1 })).minimumWind, /positive number/);
    assert.match(validator.validate(sail({ maximumWind: -1 })).maximumWind, /positive number/);
  });

  it('rejects a non boolean active flag', () => {
    assert.match(validator.validate(sail({ active: 'yes' })).active, /boolean/);
    assert.match(validator.validate(sail({ active: undefined })).active, /boolean/);
  });

  it('requires reef areas for a sail without continuous reefing', () => {
    assert.ok(validator.validate(sail({ reefs: undefined })).reefs);
    assert.deepEqual(validator.validate(sail({ reefs: [-5] })).reefs, [
      'Please enter a positive area for each reef!',
    ]);
  });

  it('requires a reefing state', () => {
    assert.match(validator.validate(sail({ reducedState: undefined })).reducedState, /Reduced state/);
    assert.deepEqual(validator.validate(sail({ reducedState: {} })).reducedState, {
      reefs: 'Value cannot be undefined',
      furledRatio: 'Value cannot be undefined',
    });
  });
});

describe('UpdateValidator', () => {
  it('accepts a reef the sail actually has', () => {
    const validator = new UpdateValidator(2);
    assert.deepEqual(validator.validate({ id: 'main', active: true, reducedState: { reefs: 1 } }), {});
  });

  it('accepts a furled ratio', () => {
    const validator = new UpdateValidator(0);
    assert.deepEqual(
      validator.validate({ id: 'genoa', active: true, reducedState: { furledRatio: 0.25 } }),
      {}
    );
  });

  it('rejects a reef beyond the ones available', () => {
    const validator = new UpdateValidator(2);
    const result = validator.validate({ id: 'main', active: true, reducedState: { reefs: 5 } });
    assert.match(result.reducedState.reefs, /smaller than 2/);
  });

  it('requires an id, an active flag and a reefing state', () => {
    const validator = new UpdateValidator(2);
    assert.ok(validator.validate({ id: '', active: true, reducedState: { reefs: 0 } }).id);
    assert.ok(validator.validate({ id: 'main', reducedState: { reefs: 0 } }).active);
    assert.ok(validator.validate({ id: 'main', active: true }).reducedState);
  });
});

describe('StatusValidator', () => {
  const validator = new StatusValidator();

  it('accepts a boolean value', () => {
    assert.deepEqual(validator.validate({ value: true }), {});
    assert.deepEqual(validator.validate({ value: false }), {});
  });

  it('rejects anything that is not a boolean', () => {
    assert.match(validator.validate({ value: 'yes' }).value, /boolean/);
    assert.ok(validator.validate({}).value);
  });
});

describe('StateValidator', () => {
  it('accepts a reef within the available ones', () => {
    assert.deepEqual(new StateValidator(2).validate({ reefs: 2 }), {});
    assert.deepEqual(new StateValidator(2).validate({ reefs: 0 }), {});
  });

  it('accepts any reef when the sail has no fixed reefs configured', () => {
    assert.deepEqual(new StateValidator(undefined).validate({ reefs: 9 }), {});
  });

  it('accepts a furled ratio between 0 and 1', () => {
    assert.deepEqual(new StateValidator(2).validate({ furledRatio: 0 }), {});
    assert.deepEqual(new StateValidator(2).validate({ furledRatio: 1 }), {});
  });

  it('rejects a furled ratio outside of 0 to 1', () => {
    assert.match(new StateValidator(2).validate({ furledRatio: 1.5 }).furledRatio, /between 0 and 1/);
    assert.match(new StateValidator(2).validate({ furledRatio: -0.5 }).furledRatio, /between 0 and 1/);
  });

  it('rejects a negative reef', () => {
    assert.match(new StateValidator(2).validate({ reefs: -1 }).reefs, /non-negative/);
  });

  it('requires at least one of reefs and furledRatio', () => {
    assert.deepEqual(new StateValidator(2).validate({}), {
      reefs: 'Value cannot be undefined',
      furledRatio: 'Value cannot be undefined',
    });
  });
});
