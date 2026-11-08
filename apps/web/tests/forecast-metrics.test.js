import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historicalFitScore} from '../src/lib/forecastMetrics.js';

const validation = (actual, predicted) => ({window_count: actual.length, windows: actual.map((value, index) => ({actual_recorded_units: value, predicted_units: predicted[index]}))});

test('old runs recover R² from the same complete planning-period test', () => {
  // Mean actual = 15, squared errors = 4 + 4, actual variation = 25 + 25.
  assert.equal(historicalFitScore(validation([10, 20], [12, 18])), 0.84);
  assert.equal(historicalFitScore(validation([10, 20], [10, 20])), 1);
  assert.equal(historicalFitScore(validation([10, 20], [15, 15])), 0);
  assert.equal(historicalFitScore(validation([10, 20], [0, 30])), -3);
});

test('a saved planning-period R² is preserved, including zero and negative scores', () => {
  for (const score of [0, -3, 0.84]) assert.equal(historicalFitScore({model: {r2: score}}), score);
});

test('constant, single, incomplete and invalid tests cannot produce a misleading R²', () => {
  for (const value of [undefined, {}, validation([], []), validation([10], [10]), validation([10, 10], [9, 11]), {...validation([10, 20], [12, 18]), window_count: 3}]) assert.equal(historicalFitScore(value), null);
  for (const bad of [null, undefined, '', '20', NaN, Infinity]) {
    assert.equal(historicalFitScore(validation([10, bad], [12, 18])), null);
    assert.equal(historicalFitScore(validation([10, 20], [12, bad])), null);
  }
  assert.equal(historicalFitScore({model: {r2: null}}), null);
});
