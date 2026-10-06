import React from "react";
import CounterApp from "./Components/CounterApp";

const App = () => {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        justifyContent: "center",
        alignContent: "center",
        border: "2px solid red",
        padding: "120px",
      }}
    >
      <CounterApp />
    </div>
  );
};

export default App;
