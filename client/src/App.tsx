import "./App.css";
import { Routes, Route, BrowserRouter as Router } from "react-router-dom";
import HomePage from "./HomePage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </Router>
  );
}

export default App;
