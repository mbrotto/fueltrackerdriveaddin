/**
*   Helper object for localizing units for MyGeotab API aplications and add-ins
*/
(function () {
    'use strict';
    var LocalUnits = function (user) {
        const milesFactor = 0.621371;
        const gallonsFactor = 0.264172;
        const imperialGallonFactor = 0.219969;

        return {

            /**
             * Gets localized fuel consumption
             * @param distance {number} The distance in meters
             * @param volume {numer} The volume in liters
             * @returns {number} Returns a string of local fuel consumption
             */
            fuelConsumption: function (distance, volume) {
                switch (user.fuelEconomyUnit) {
                    case 'MPGImperial':
                        return (((distance / 1000) * milesFactor) / (volume * imperialGallonFactor));
                    case 'MPGUS':
                        return (((distance / 1000) * milesFactor) / (volume * gallonsFactor));
                    case 'KmPerLiter':
                        return ((distance / 1000) / volume);
                    default:
                        return (volume / (distance / 1000) * 100);
                }
            },

            /**
             * Gets the localized fuel consumption abbreviation
             * @returns {string} Returns a string of local fuel consumption
             */
            fuelConsumptionAbbr: function () {
                switch (user.fuelEconomyUnit) {
                    case 'MPGImperial':
                        return 'mpg';
                    case 'MPGUS':
                        return 'mpg';
                    case 'KmPerLiter':
                        return 'km/l';
                    default:
                        return 'l/100km';
                }
            },

            /**
             * Gets localized volume
             * @param volume {} The volume in liters
             * @returns {number} Returns a string of local distance (km or mi)
             */
            volume: function (volume) {
                if (user.isMetric) {
                    return volume;
                } else if (user.fuelEconomyUnit === 'MPGImperial') {
                    return (volume * imperialGallonFactor);
                }
                return (volume * gallonsFactor);
            },

            /**
             * Get volume as server units (metric)
             * @param volume {} The volume in liters
             * @param units {} The volume units
             * @returns {number} Retruns the volume in server format
             */
            serverVolume: function (volume, units) {
                if (units === 'l') {
                    return volume;
                } else if (user.fuelEconomyUnit === 'MPGImperial') {
                    return volume / imperialGallonFactor;
                }
                return volume / gallonsFactor;
            },

            /**
             * Gets localized volume abbreviation
             * @returns {string} Returns a string of local distance abbreviation (L or gal)
             */
            volumeAbr: function () {
                return user.isMetric ? 'l' : 'gal';
            },

            /**
             * Get localized volume (full name)
             * @returns {string} Returns a string of local distance (Liter or Gallon)
             */
            volumeString: function () {
                return user.isMetric ? 'Liter' : 'Gallon';
            },

            /**
             * Gets localized distance
             * @param distance {number} The distance in meters
             * @returns {number} Returns a string of local distance (km or mi)
             */
            distance: function (distance) {
                return user.isMetric ? (distance / 1000) : ((distance / 1000) * milesFactor);
            },

            /**
             * Get distance as server units (metric)
             * @param distance {number} The distance in meters
             * @returns {string} Returns a string of local distance (km or mi)
             */
            serverDistance: function (distance) {
                return user.isMetric ? distance : (distance / milesFactor);
            },

            /**
             * Gets the localized distance abbreviation
             * @returns {string} Returns a string of local distance abbreviation (km or mi)
             */
            distanceAbr: function () {
                return user.isMetric ? 'km' : 'mi';
            }

        };
    }, globals;

    globals = (function () { return this || (0, eval)('this'); }());

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LocalUnits;
    } else if (typeof define === 'function' && define.amd) {
        define(function () { return LocalUnits; });
    } else {
        globals.LocalUnits = LocalUnits;
    }
}());
