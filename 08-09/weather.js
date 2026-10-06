const API_KEY = "b24cdd41b781f3f14e992c575c8d7674";
const body=document
fetch(
  `https://api.openweathermap.org/data/4.0/onecall/current?lat={lat}&lon={lon}&appid={API key}${API_KEY}`,
)
  .then((response) => response.json())
  .then((data) => {
    console.log(data);
  });
