import React from "react";
import Student from "./components/Student";
import Navigation from "./layout/Navigation";

const App = () => {
  return (
    <div className="bg-black min-h-screen space-y-6">
      <Navigation />
      <Student />
      <br />
      <Student />
      <br />
      <Student />
      <br />
    </div>
  );
};

export default App;
