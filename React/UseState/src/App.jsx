import React from "react";
import CounterApp from "./Components/CounterApp";
import Assignment5 from "./Components/Assignment5";

const App = () => {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Assignment5 />
    </div>
  );
};

export default App;
