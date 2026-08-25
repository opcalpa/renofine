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
  modelCallProperties,
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

/**
 * The analytics shape. Two call sites report a drop — the birth dialog and an
 * existing project — and if they invent different property names the metric
 * silently becomes two metrics that cannot be compared. That is worse than not
 * measuring, so the shape is built in one place and pinned here.
 */
test.describe('model call properties', () => {
  test('a drop reports its total, its files and the ratio between them', () => {
    const log = makeModelCallLog();
    for (let i = 0; i < 30; i++) noteModelCall(log, 'classify-document');
    expect(modelCallProperties(log, 100)).toEqual({
      model_calls: 30,
      files_read: 100,
      calls_per_file: 0.3,
      calls_classify_document: 30,
    });
  });

  test('per-function counts survive as chartable names', () => {
    const log = makeModelCallLog();
    noteModelCall(log, 'parse-renovation-description');
    noteModelCall(log, 'extract-document-text');
    const props = modelCallProperties(log, 2);
    // Hyphens cannot be charted as property names; underscores can.
    expect(props.calls_parse_renovation_description).toBe(1);
    expect(props.calls_extract_document_text).toBe(1);
  });

  test('a drop that read nothing reports no ratio rather than a wrong one', () => {
    const props = modelCallProperties(makeModelCallLog(), 0);
    expect(props.model_calls).toBe(0);
    expect('calls_per_file' in props).toBe(false);
  });

  test('no log at all reports nothing, not zeroes that look like a measurement', () => {
    expect(modelCallProperties(undefined, 10)).toEqual({});
  });
});
