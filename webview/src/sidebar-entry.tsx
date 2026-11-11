import { createRoot } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import './sidebar.css';

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<Sidebar />);
}
