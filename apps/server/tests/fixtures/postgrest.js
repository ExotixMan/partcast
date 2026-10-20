import assert from 'node:assert/strict';

export function parseLiteralFilters(logic){
 const matches=[...logic.matchAll(/(?:^|,)([a-z_]+)\.imatch\.("(?:[^"\\]|\\.)*")(?=,|$)/g)];
 assert.equal(matches.map(match=>match[0]).join(''),logic);
 return matches.map(match=>({column:match[1],pattern:JSON.parse(match[2])}));
}
