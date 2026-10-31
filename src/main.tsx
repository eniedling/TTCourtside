import { render } from 'preact';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';
import './styles.css';
import { App } from './app';

render(<App />, document.getElementById('app')!);
