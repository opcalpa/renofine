/**
 * What a drop costs, as a number rather than a claim.
 *
 * Every token-saving in the import pipeline was argued before it was measured.
 * These pin the counter itself, because a measurement that quietly counts wrong
 * is worse than none: it looks like evidence.
 */
import { test, expect } from '@playwright/test';
import {
  callsPerFile,
  describeModelCalls,
  makeModelCallLog,
  noteModelCall,
} from '../src/lib/modelCalls';

test.describe('model call log', () => {
  test('a fresh log has cost nothing', () => {
    const log = makeModelCallLog();
    expect(log.total).toBe(0);
    expect(log.byKind).toEqual({});
    expect(describeModelCalls(log)).toBe('');
  });

  test('each log is its own — a second drop does not inherit the first', () => {
    const first = makeModelCallLog();
    noteModelCall(first, 'classify-document');
    const second = makeModelCallLog();
    expect(second.total).toBe(0);
    expect(first.total).toBe(1);
  });

  test('calls accumulate per kind and in total', () => {
    const log = makeModelCallLog();
    noteModelCall(log, 'classify-document');
    noteModelCall(log, 'classify-document');
    noteModelCall(log, 'process-floorplan');
    expect(log.total).toBe(3);
    expect(log.byKind).toEqual({ 'classify-document': 2, 'process-floorplan': 1 });
  });

  test('an absent log is free — callers outside a drop pay nothing', () => {
    expect(() => noteModelCall(undefined, 'classify-document')).not.toThrow();
  });

  test('the breakdown reads biggest first', () => {
    const log = makeModelCallLog();
    noteModelCall(log, 'process-floorplan');
    for (let i = 0; i < 5; i++) noteModelCall(log, 'classify-document');
    noteModelCall(log, 'parse-renovation-description');
    noteModelCall(log, 'parse-renovation-description');
    expect(describeModelCalls(log)).toBe(
      'classify-document 5 · parse-renovation-description 2 · process-floorplan 1'
    );
  });

  test('calls per file is the number a saving actually moves', () => {
    const log = makeModelCallLog();
    for (let i = 0; i < 62; i++) noteModelCall(log, 'classify-document');
    // 100 files dropped, 100 read.
    expect(callsPerFile(log, 100)).toBe(0.6);
    // Same folder re-dropped with 38 recognised: fewer calls AND fewer files,
    // so the ratio is what shows whether the pipeline itself got cheaper.
    expect(callsPerFile(log, 62)).toBe(1);
  });

  test('nothing read divides by nothing, and says so', () => {
    expect(callsPerFile(makeModelCallLog(), 0)).toBeNull();
  });
});
