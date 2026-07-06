/* core: framework wiring — every module imports from here */
import React,{useState,useEffect,useRef,useMemo,useCallback,memo,createContext,useContext} from 'https://esm.sh/react@19.1.0';
import {createRoot} from 'https://esm.sh/react-dom@19.1.0/client?deps=react@19.1.0';
import {createPortal} from 'https://esm.sh/react-dom@19.1.0?deps=react@19.1.0';
import htm from 'https://esm.sh/htm@3.1.1';
import html2canvas from 'https://esm.sh/html2canvas@1.4.1';
const h=htm.bind(React.createElement);
export {h,React,useState,useEffect,useRef,useMemo,useCallback,memo,createContext,useContext,createRoot,createPortal,html2canvas};
