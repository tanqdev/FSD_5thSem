import React from "react";
import studentPhoto from "../assets/Image1.png";

const Student = () => {
  return (
    <div
      className="w-80 border-2 border-red-500 bg-black rounded-lg overflow-hidden shadow-lg"
      style={{ backgroundImage: `url(${studentPhoto})` }}
    >
      <div className="h-72 bg-cover bg-center"></div>

      <h3 className="text-red-500 text-center text-xl font-bold py-4">
        Student ID Card
      </h3>
    </div>
  );
};

export default Student;
