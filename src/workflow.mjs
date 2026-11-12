import{createWorkflow as shared}from'@zesia/runtime/workflow';
import{consultOverA2A}from'./a2a.mjs';
export * from'@zesia/runtime/workflow';
export function createWorkflow(options={}){return shared({requestConsult:consultOverA2A,...options});}
