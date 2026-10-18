import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppUpdate from './components/AppUpdate.jsx';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import {LocaleProvider} from './context/LocaleContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><LocaleProvider><ErrorBoundary><AuthProvider><App/><AppUpdate/></AuthProvider></ErrorBoundary></LocaleProvider></BrowserRouter></React.StrictMode>
);
