import {jsx as reactJsx,jsxs as reactJsxs} from 'react/jsx-runtime';
import type {ElementType,Key} from 'react';
import {prepare} from './prepare';
export {Fragment} from 'react/jsx-runtime';
export type {JSX} from 'react/jsx-runtime';
export function jsx(type:ElementType,props:Record<string,unknown>|null,key?:Key){const result=prepare(type,props);return reactJsx(result.type as ElementType,result.props,key);}
export function jsxs(type:ElementType,props:Record<string,unknown>|null,key?:Key){const result=prepare(type,props);return reactJsxs(result.type as ElementType,result.props,key);}
