// Sample weather for /demo (Home). A fixed, made-up forecast in the Open-Meteo shape; the demo never looks up a real place.
/** @typedef {import("../types").WeatherResult} WeatherResult */

/** @param {Date} d */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * @param {Date} today
 * @returns {WeatherResult}
 */
export function weather(today) {
  const days = [0, 1, 2, 3, 4].map((n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); });
  return {
    units: "fahrenheit",
    data: {
      current: {
        temperature_2m: 64, apparent_temperature: 62, relative_humidity_2m: 58, precipitation: 0,
        weather_code: 2, wind_speed_10m: 8, wind_direction_10m: 225, surface_pressure: 1016,
      },
      daily: {
        time: days,
        weather_code: [2, 0, 61, 3, 1],
        temperature_2m_max: [71, 74, 63, 66, 70],
        temperature_2m_min: [52, 55, 50, 48, 51],
        sunrise: days.map((d) => `${d}T07:12`),
        sunset: days.map((d) => `${d}T18:41`),
        precipitation_probability_max: [10, 5, 70, 20, 10],
      },
    },
  };
}
