/* eslint-disable no-undef */
/**
 * @param api The GeotabApi object for making calls to MyGeotab.
 * @param state The state object allows access to URL, page navigation and global group filter.
 * @returns {{initialize: Function, focus: Function, blur: Function}}
 */
geotab.addin.driveFuelTracker = () => {
    'use strict';
    // Dom elements
    let elLoading;
    let elTransactions;
    let elCharts;
    let elMap;
    let elDevice;
    let elHeader;
    let elContent;
    let elMenu;
    let elError;
    let elErrorMessage;
    let elNoAccess;
    let elRetry;
    let elNoResult;
    let elDialog;
    let elErrorDialog;
    let elDateSelect;
    let elTransactionDetails;
    let elAddress;
    let elAddressProgress;
    let elTransactionsPanelBtn;
    let elAddPanelBtn;
    let elChartsPanelBtn;
    let elMapPanelBtn;
    let elNoDeviceDialog;

    let mapMarkerIcon;

    let api;
    let state;

    let driver;
    let device;

    let monthTmplFn;
    let transactionTmplFn;
    let transactionDetailsTmplFn;

    let settings;
    let localUnits;
    let securityCalculator;

    let transactionLookup;
    let map;
    let iconGeometry;
    let isSaving;
    let timeout;
    let timezoneOffset = new Date().getTimezoneOffset() * 60 * 1000;
    let charts = [];

    let settingsKey = 'addin-fuel-tracker';

    /**
     * Display a toast message
     *
     * @param msg {string} The toast message
     */
    let toast = (title, msg) => {
        api.mobile.notify(title, msg);
    };

    let switchTab = tab => {
        let active = 'is-active';
        let tabs = document.querySelectorAll('.mdl-tabs__tab');
        for (let i = 0; i < tabs.length; i++) {
            tabs[i].classList.remove(active);
        }
        document.querySelector(`[href="${tab}"]`).classList.add(active);
        document.querySelector(tab).classList.add(active);
    };

    let toggle = (el, visible) => {
        let hidden = 'hidden';
        if (visible) {
            el.classList.remove(hidden);
        } else {
            el.classList.add(hidden);
        }
    };

    let viewStates = {
        list: 0,
        add: 1,
        error: 2,
        noaccess: 3,
        noresults: 4,
        charts: 5,
        map: 6
    };

    let view = viewState => {
        let reset = () => {
            toggle(elTransactions, false);
            toggle(elCharts, false);
            toggle(elMap, false);
            toggle(elNoResult, false);
            toggle(elError, false);
            toggle(elNoAccess, false);
            toggle(elTransactionDetails, false);
            toggle(elContent, true);
            toggle(elHeader, true);
            toggle(elDateSelect, true);
            Array.prototype.forEach.call(document.querySelectorAll('.mdl-tabs__panel.hidden'), el => {
                toggle(el, true);
            });
        };

        reset();

        switch (viewState) {
            case viewStates.list:
                toggle(elTransactions, true);
                switchTab('#transactions-panel');
                break;
            case viewStates.add:
                toggle(elDateSelect, false);
                toggle(elTransactionDetails, true);
                switchTab('#add-panel');
                break;
            case viewStates.error:
                toggle(elError, true);
                break;
            case viewStates.noaccess:
                toggle(elNoAccess, true);
                toggle(elHeader, false);
                break;
            case viewStates.noresults:
                toggle(elNoResult, true);
                break;
            case viewStates.charts:
                toggle(elCharts, true);
                switchTab('#charts-panel');
                break;
            case viewStates.map:
                toggle(elMap, true);
                switchTab('#map-panel');
                break;
        }
    };

    /**
     * Show or hide loading spinner
     *
     * @param isLoading {bool} Indicating loading state
     */
    let loading = isLoading => {
        if (isLoading) {
            elLoading.classList.add('is-active');
        } else {
            elLoading.classList.remove('is-active');
        }
    };

    /**
     * Error handler
     *
     * @param msg {object} The error message
     * @param err {object} The error
     * @param dontShowState {boolean} Your going to handle displaying to the user
     */
    let errorHandler = (msg, err, dontShowState) => {
        loading(false);
        isSaving = false;
        if (!dontShowState) {
            view(viewStates.error);
        }
        Array.prototype.forEach.call(elErrorMessage, el => {
            el.textContent = msg;
        });
        console.log(msg);
    };

    /**
     * Sets the settings
     *
     * @param {object} value The settings
     */
    let setSettings = value => {
        settings = value;
        localStorage.setItem(settingsKey, JSON.stringify(value));
    };

    /**
     * Get the settings
     *
     * @returns  {object} The settings
     */
    let getSettings = () => {
        let defaultSettings = {
            period: 1,
            currencyCode: 'CAD',
            fuelGrade: '2'
        };

        return JSON.parse(localStorage.getItem(settingsKey)) || defaultSettings;
    };

    /**
     * Center map to coordinates
     *
     * @param  {type} lat The latitude
     * @param  {type} lon The longitude
     */
    let setCenter = (lat, lon) => {
        let center = [lon, lat];
        map.getView().setCenter(ol.proj.transform(center, 'EPSG:4326', 'EPSG:3857'));
        iconGeometry.setCoordinates(ol.proj.transform(center, 'EPSG:4326', 'EPSG:3857'));
    };

    /**
     * Set the address feild based on coordinates
     *
     * @param  {number}   lat    The latitude
     * @param  {number}   lon    The longitude
     * @param  {Function} cb     The callback
     */
    let setAddress = (lat, lon, cb) => {
        api.call('GetAddresses', {
            coordinates: [{
                x: lon,
                y: lat
            }]
        }, addresses => {

            elAddress.value = addresses[0].formattedAddress;
            toggle(elAddressProgress, false);

            if (cb) {
                cb(addresses[0]);
            }

        }, errorHandler);

    };

    /**
     * Center on last known loction from device
     */
    let defaultLocation = (cb) => {
        // mobile device geolocation not available, fall back to last known device position
        let now = new Date().toISOString();
        api.call('Get', {
            typeName: 'LogRecord',
            search: {
                fromDate: now,
                toDate: now,
                deviceSearch: {
                    id: device.id
                }
            }
        }, lastPosition => {
            if (lastPosition.length) {
                setCenter(lastPosition[0].latitude, lastPosition[0].longitude);
                setAddress(lastPosition[0].latitude, lastPosition[0].longitude, cb);
            }
        }, e => {
            // failed to get last known position, user must enter manually
            elAddress.value = 'Enable geolocation or enter address';
            toggle(elAddressProgress, false);
            console.log(e);
            return;
        });
    };

    /**
     * Center map on current or last known location
     *
     * @param  {type} isGeolocationEnabled is geolocation enabled
     */
    let getLocation = (cb) => {
        let geolocation = api.mobile && api.mobile.geolocation || navigator.geolocation;

        toggle(elAddressProgress, true);

        if (geolocation) {
            geolocation.getCurrentPosition(position => {
                setCenter(position.coords.latitude, position.coords.longitude);
                setAddress(position.coords.latitude, position.coords.longitude, cb);
            }, defaultLocation, {
                    maximumAge: 0,
                    timeout: 10000,
                    enableHighAccuracy: true
                });
        } else {
            defaultLocation();
        }
    };

    let initMap = () => {

        iconGeometry = new ol.geom.Point([0, 0]);

        let iconFeature = new ol.Feature({
            geometry: iconGeometry,
            name: 'Fill-Up'
        });

        let iconStyle = new ol.style.Style({
            image: new ol.style.Icon({
                anchor: [0.5, 1],
                anchorXUnits: 'fraction',
                anchorYUnits: 'fraction',
                opacity: 0.90,
                src: mapMarkerIcon
            })
        });

        iconFeature.setStyle(iconStyle);

        let vectorSource = new ol.source.Vector({
            features: [iconFeature]
        });

        let vectorLayer = new ol.layer.Vector({
            source: vectorSource
        });

        map = new ol.Map({
            target: 'map', // The DOM element that will contains the map
            renderer: 'canvas', // Force the renderer to be used
            layers: [
                // Add a new Tile layer getting tiles from OpenStreetMap source
                new ol.layer.Tile({
                    source: new ol.source.OSM()
                }),
                vectorLayer
            ],
            // Create a view centered on the specified location and zoom level
            view: new ol.View({
                center: ol.proj.transform([0, 0], 'EPSG:4326', 'EPSG:3857'),
                zoom: 16
            })
        });

        map.on('singleclick', evt => {
            let cords = ol.proj.transform([evt.coordinate[0], evt.coordinate[1]], 'EPSG:3857', 'EPSG:4326');
            iconGeometry.setCoordinates(evt.coordinate);
            setAddress(cords[1], cords[0]);
        });
    };

    let cache = {
        type: {
            'FuelTransaction': {
                device: null,
                period: null,
                data: null,
                exp: new Date()
            }
        }
    };

    let store = (type, period, cb) => {
        let stateDevice = state.device;
        let isExpired = !cache.type[type] || !cache.type[type].exp || cache.type[type].exp <= new Date();

        if (cache.type[type] && cache.type[type].device && cache.type[type].device.id === device.id && cache.type[type].period === period && !isExpired) {
            cb(cache.type[type].data);
            return;
        }

        let date = new Date();
        let firstDay = new Date(date.getFullYear(), date.getMonth() - period, 1);
        let lastDay = new Date(Date.UTC(2050, 0, 1));

        api.call('Get', {
            typeName: 'FuelUpEvent',
            search: {
                fromDate: firstDay.toISOString(),
                toDate: lastDay.toISOString(),
                deviceSearch: {
                    id: state.device.id
                }
            }
        }, fillups => {
            let transactionRequests = [];

            fillups.forEach(fillup => {
                (fillup.fuelTransactions || []).forEach(transaction => {
                    transactionRequests.push(['Get', {
                        typeName: 'FuelTransaction',
                        search: {
                            id: transaction.id
                        }
                    }]);
                });
            });

            api.multiCall(transactionRequests, transactions => {
                transactionLookup = {};

                if (device === 'NoDeviceId') {
                    transactions = transactions.filter(transaction => {
                        return transaction.length > 0 && transaction[0].driverName === driver.name;
                    });
                }

                transactions.forEach(transaction => {
                    if (transaction.length) {
                        if (transaction[0].sourceData) {
                            transaction[0].grade = JSON.parse(transaction[0].sourceData).grade;
                        }
                        transactionLookup[transaction[0].id] = transaction[0];
                    }
                });

                transactions = [];

                fillups.forEach(fillup => {
                    (fillup.fuelTransactions || []).forEach(transaction => {
                        transaction = transactionLookup[transaction.id];
                        if (transaction) {
                            transaction.dateTime = new Date(transaction.dateTime);
                            transaction.consumption = (fillup.totalFuelUsed || fillup.volume) && fillup.distance ? localUnits.fuelConsumption(fillup.distance, fillup.totalFuelUsed || fillup.volume).toFixed(1) + ' ' + localUnits.fuelConsumptionAbbr() : '';
                            transaction.distance = localUnits.distance(fillup.distance);
                            transaction.distanceAbbr = localUnits.distanceAbr();
                            transaction.volume = localUnits.volume(transaction.volume);
                            transaction.volumeAbbr = localUnits.volumeAbr();

                            transactions.push(transaction);
                        }
                    });
                });

                let exp = new Date();
                exp = new Date(exp.setMinutes(exp.getMinutes() + 30));

                cache.type[type] = {
                    device: stateDevice,
                    period,
                    data: transactions,
                    exp
                };

                cb(transactions);

            }, err => cb(null, err));

        }, err => cb(null, err));
    };

    /**
     * Render the deive
     *
     * @param device {object} The device
     */
    let renderDevice = () => {
        let setDeviceNameUI = () => {
            elDevice.textContent = device === 'NoDeviceId' ? 'No vehicle' : device.name;
            view();
        };

        if (state.device.id !== device.id || !device.name) {
            api.call('Get', {
                typeName: 'Device',
                search: {
                    id: state.device.id
                }
            }, resluts => {
                device = resluts[0];
                setDeviceNameUI();

            }, errorHandler);
        } else {
            setDeviceNameUI();
        }
    };

    let renderList = byMonth => {
        let elements = byMonth.map(month => {
            return monthTmplFn({
                month: month.key,
                transactions: month.values.map(transactionTmplFn).join('')
            });
        });

        elTransactions.innerHTML = elements.join('');

        Array.prototype.forEach.call(elTransactions.querySelectorAll('.mdl-list__item'), listItem => {
            let id = listItem.getAttribute('data-id');
            listItem.addEventListener('click', ev => {
                if (id) {
                    // clone hack
                    switchMode(JSON.parse(JSON.stringify(transactionLookup[id.replace('#', '')])));
                }
                ev.preventDefault();
            });
        });

        if (!elements.length) {
            view(viewStates.noresults);
            return;
        }
        view(viewStates.list);
    };

    let renderMap = byMonth => {
        let fillups = [];
        byMonth.forEach(month => {
            fillups = fillups.concat(month.values);
        });

        if (!fillups.length) {
            view(viewStates.noresults);
            return;
        }
        elMap.innerHTML = '';
        view(viewStates.map);

        let coordinates = [];
        let iconFeatures = fillups.map(fillup => {
            let lat = fillup.location.y;
            let lon = fillup.location.x;

            coordinates.push([lon, lat]);

            return new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.transform([lon, lat], 'EPSG:4326', 'EPSG:3857')),
                name: 'Fuel Transaction',
                cost: fillup.cost,
                dateTime: fillup.dateTime
            });
        });

        let vectorSource = new ol.source.Vector({
            features: iconFeatures
        });

        let iconStyle = new ol.style.Style({
            image: new ol.style.Icon({
                anchor: [0.5, 1],
                anchorXUnits: 'fraction',
                anchorYUnits: 'fraction',
                opacity: 0.90,
                src: mapMarkerIcon
            })
        });

        let vectorLayer = new ol.layer.Vector({
            source: vectorSource,
            style: iconStyle
        });

        let mapView;
        if (coordinates.length < 1) {
            mapView = new ol.View({
                center: ol.proj.transform([0, -49.89080720000001], 'EPSG:4326', 'EPSG:3857'),
                zoom: 2
            });
        } else if (coordinates.length === 1) {
            mapView = new ol.View({
                center: ol.proj.transform([coordinates[0][0], coordinates[0][1]], 'EPSG:4326', 'EPSG:3857'),
                zoom: 16
            });
        }

        let mapFillups = new ol.Map({
            target: 'tracker-map', // The DOM element that will contains the map
            renderer: 'canvas', // Force the renderer to be used
            layers: [
                // Add a new Tile layer getting tiles from OpenStreetMap source
                new ol.layer.Tile({
                    source: new ol.source.OSM()
                }),
                vectorLayer
            ],
            // Create a view centered on the specified location and zoom level
            view: mapView
        });

        if (coordinates.length > 1) {
            let multiPoint = new ol.geom.MultiPoint(coordinates);
            let extent = multiPoint.getExtent();
            extent = ol.extent.applyTransform(extent, ol.proj.getTransform('EPSG:4326', 'EPSG:3857'));
            mapFillups.updateSize();
            mapFillups.getView().fit(extent, mapFillups.getSize());
        }

        window.onresize = () => {
            setTimeout(() => mapFillups.updateSize(), 200);
        };

    };

    /**
     * Render the transactions
     *
     * @param transactions {array} The transactions to render
     */
    let sortByMonth = transactions => {
        let byMonth = {};

        transactions.sort((f1, f2) => {
            return f2.dateTime - f1.dateTime;
        });

        transactions.forEach(transaction => {
            let key = transaction.dateTime.format('mmmm yyyy');

            if (!byMonth[key]) {
                byMonth[key] = [];
            }
            byMonth[key].push(transaction);
        });

        byMonth = Object.keys(byMonth).map(month => {
            return {
                key: month,
                values: byMonth[month]
            };
        });

        return byMonth;
    };

    /**
     * Reload transactions
     *
     * @param period {period} The period of time
     */
    let reload = (period, cb) => {
        loading(true);
        view();

        elTransactions.innerHTML = '';

        store('FuelTransaction', period, (transactions, err) => {
            if (err) {
                errorHandler(err);
                return;
            }

            cb(sortByMonth(transactions));

            loading(false);
        });
    };

    /**
     * Add a new or set an existing transaction
     *
     * @param  {string} id The id (null if adding)
     * @param  {Function} cb The callback
     */
    let save = (id, cb) => {
        let toProductType = grade => {
            switch (grade) {
                case '1':
                    return 'Regular';
                case '2':
                    return 'MidGrade';
                case '3':
                    return 'Premium';
                case '4':
                    return 'Super';
                case '5':
                    return 'Diesel';
                case '6':
                    return 'E85';
                case '7':
                    return 'CNG';
                case '8':
                    return 'LPG';
                case '9':
                    return 'NonFuel';
                default:
                    return 'Unknown';
            }
        };
        let fuelGrade = elTransactionDetails.querySelector('#tracker-add-grade').value;
        let location = ol.proj.transform(iconGeometry.getCoordinates(), 'EPSG:3857', 'EPSG:4326');
        let localDate = new Date(elTransactionDetails.querySelector('#tracker-add-date').value) || new Date();
        let utcDate = new Date(localDate.getTime() + timezoneOffset);
        let units = elTransactionDetails.querySelector('#tracker-fuel-units').value;
        let transaction = {
            id: id,
            comments: elTransactionDetails.querySelector('#tracker-add-comments').value,
            cost: parseFloat(elTransactionDetails.querySelector('#tracker-add-cost').value || 0),
            currencyCode: elTransactionDetails.querySelector('#tracker-add-currencyCode').value,
            dateTime: utcDate.toISOString(),
            description: device.name,
            driverName: driver.name,
            licencePlate: device.licencePlate,
            location: {
                x: location[0],
                y: location[1]
            },
            odometer: localUnits.serverDistance(parseInt(elTransactionDetails.querySelector('#tracker-add-odometer').value || 0)),
            provider: 'Drive',
            serialNumber: device.serialNumber,
            vehicleIdentificationNumber: device.vehicleIdentificationNumber,
            volume: localUnits.serverVolume(parseFloat(elTransactionDetails.querySelector('#tracker-add-volume').value || 0), units),
            grade: fuelGrade,
            productType: toProductType(fuelGrade)
        };

        settings.grade = transaction.grade;
        settings.currencyCode = transaction.currencyCode;
        setSettings(settings);

        transaction.sourceData = JSON.stringify(transaction);

        // validate
        if (!transaction.cost) {
            return;
        }
        if (!transaction.volume) {
            return;
        }
        if (!transaction.dateTime) {
            return;
        }

        if (isSaving) {
            return;
        }
        isSaving = true;

        loading(true);

        cache.type.FuelTransaction.exp = new Date();

        let method = transaction.id ? 'Set' : 'Add';

        api.call(method, {
            typeName: 'FuelTransaction',
            entity: transaction
        }, () => {
            isSaving = false;
            loading(false);
            if (cb) {
                cb();
            }
        }, (msg, err) => {
            elErrorDialog.showModal();
            errorHandler(msg, err, true);
        });

        api.call('TraceText', {
            key: `addin-drive-fuel-tracker:${method}`,
            value: 1
        }, () => { }, err => {
            console.error(err.message);
        });
    };

    /**
     * Remove a transaction
     *
     * @param  {string} id  The id
     * @param  {Function} cb  The callback
     * @param  {Function} err The error callback
     */
    let remove = (id, cb, err) => {

        isSaving = true;

        cache.type.FuelTransaction.exp = new Date();

        api.call('Remove', {
            typeName: 'FuelTransaction',
            entity: {
                id: id
            }
        }, () => {
            isSaving = false;
            if (cb) {
                cb();
            }
        }, err);

    };

    const Locals = {
        UnitedStates: 'UNITEDSTATES',
        Canada: 'CANADA'
    };

    /**
     * Switch between list and add/edit mode
     *
     * @param fillup {object} The fillup, if none display list
     */
    let switchMode = fillup => {
        let updateLocal = (local, includeCurrency, rootEl) => {
            let unitShortName;
            let unitLongName;
            let currency;

            switch (local) {
                case Locals.Canada:
                    unitShortName = 'l';
                    unitLongName = 'Litre';
                    currency = 'CAD';
                    break;
                case Locals.UnitedStates:
                    unitShortName = 'gal';
                    unitLongName = 'Gallon';
                    currency = 'USD';
                    break;
                default:
                    return;
            }

            rootEl.querySelector('#tracker-fuel-units').value = unitShortName;
            rootEl.querySelector('[for="tracker-add-cost-per-unit"]').textContent = `Price Per ${unitLongName}`;

            if (includeCurrency) {
                rootEl.querySelector('#tracker-add-currencyCode').value = currency;
            }
        };

        if (!fillup) {
            view(viewStates.list);
            elTransactionDetails.innerHTML = '';
            // need to let MDL know that the DOM has changed
            componentHandler.upgradeDom();
        } else {
            let loadTime = new Date();
            // Subtract the time zone offset from the current UTC date, and pass
            // that into the Date constructor to get a date whose UTC date/time is
            // adjusted by timezoneOffset for display purposes.
            let localDate = new Date(new Date(fillup.dateTime).getTime() - timezoneOffset);
            // Get that local date's ISO date string and remove the Z.
            let localDateISOString = localDate.toISOString();

            fillup.dateTime = localDateISOString.substr(0, localDateISOString.length - 8);
            fillup.grade = fillup.grade || settings.grade;
            fillup.currencyCode = fillup.currencyCode || settings.currencyCode;
            fillup.costPerUnit = (fillup.cost / fillup.volume) || '';
            fillup.units = localUnits.volumeString();
            fillup.odometer = Math.round(localUnits.distance(fillup.odometer * 1000));

            elTransactionDetails.innerHTML = transactionDetailsTmplFn(fillup);

            // need to let MDL know that the DOM has changed
            componentHandler.upgradeDom();

            view(viewStates.add);

            elAddress = elTransactionDetails.querySelector('#tracker-add-address');
            elAddressProgress = elTransactionDetails.querySelector('#tracker-add-address-progress');

            // setup map
            initMap();

            if (fillup.location) {
                setCenter(fillup.location.y, fillup.location.x);
                setAddress(fillup.location.y, fillup.location.x);
            } else {
                getLocation(address => {
                    let durration = new Date() - loadTime;

                    if (durration > 3000) {
                        // likley user started editing fields already, too late to change UI
                        return;
                    }

                    let country = address.country;

                    if (country.toUpperCase() === Locals.UnitedStates && driver.isMetric) {
                        updateLocal(Locals.UnitedStates, true, elTransactionDetails);
                    }

                    if (country.toUpperCase() === Locals.Canada && !driver.isMetric) {
                        updateLocal(Locals.Canada, true, elTransactionDetails);
                    }
                });
            }

            // event listeners
            elAddress.addEventListener('keyup', evt => {
                let value = evt.srcElement.value;
                let keyCode = evt.keyCode;

                clearTimeout(timeout);
                timeout = setTimeout(() => {

                    if (value && value.length && value.length > 5) {
                        toggle(elAddressProgress, true);

                        api.call('GetCoordinates', {
                            addresses: [value]
                        }, coordinates => {
                            toggle(elAddressProgress, false);
                            setCenter(coordinates[0].y, coordinates[0].x);
                        }, err => {
                            toggle(elAddressProgress, false);
                            console.log(err);
                            // TODO: show red around field
                        });

                    }
                }, keyCode === 13 ? 50 : 1400);
            });

            // calulate cost or cost per unit by the given input
            let elCost = elTransactionDetails.querySelector('#tracker-add-cost');
            let elVolume = elTransactionDetails.querySelector('#tracker-add-volume');
            let elCostPerUnit = elTransactionDetails.querySelector('#tracker-add-cost-per-unit');
            elCost.addEventListener('keyup', evt => {
                let cost = parseFloat(evt.target.value);
                let volume = parseFloat(elVolume.value);

                if (Boolean(cost) && Boolean(volume)) {
                    let costPerUnit = cost / volume;
                    elCostPerUnit.value = costPerUnit && costPerUnit.toFixed(2);
                    elCostPerUnit.parentNode.classList.add('is-dirty');
                }
            });
            elVolume.addEventListener('keyup', evt => {
                let volume = parseFloat(evt.target.value);
                let costPerUnit = parseFloat(elCostPerUnit.value);

                if (Boolean(costPerUnit) && Boolean(volume)) {
                    let cost = volume * costPerUnit;
                    elCost.value = cost && cost.toFixed(2);
                    elCost.parentNode.classList.add('is-dirty');
                }
            });
            elCostPerUnit.addEventListener('keyup', evt => {
                let costPerUnit = parseFloat(evt.target.value);
                let volume = parseFloat(elVolume.value);

                if (Boolean(costPerUnit) && Boolean(volume)) {
                    let cost = volume * costPerUnit;
                    elCost.value = cost && cost.toFixed(2);
                    elCost.parentNode.classList.add('is-dirty');
                }
            });

            elTransactionDetails.querySelector('#tracker-fuel-units').addEventListener('change', evt => {
                updateLocal(evt.target.value === 'l' ? Locals.Canada : Locals.UnitedStates, false, elTransactionDetails);
            });

            elTransactionDetails.querySelector('#tracker-add-cancel').addEventListener('click', () => {
                switchMode();
                reload(settings.period, renderList);
            });
            elTransactionDetails.querySelector('#tracker-add-remove').addEventListener('click', () => {
                elDialog.showModal();
            });
            elTransactionDetails.querySelector('#tracker-add-save').addEventListener('click', () => {
                save(fillup.id, () => {
                    switchMode();
                    reload(settings.period, renderList);
                    toast('', 'Success, saved fill-up');
                });
            });
        }
    };

    let renderChart = byMonth => {
        let labelSets = [
            [],
            [],
            [],
            []
        ];
        let dataSets = [
            [],
            [],
            [],
            []
        ];
        let chartTypes = [
            'line',
            'line',
            'line',
            'bar'
        ];
        let backgroundColors = [
            'rgba(255, 99, 132, 0.2)',
            'rgba(54, 162, 235, 0.2)',
            'rgba(255, 206, 86, 0.2)',
            'rgba(153, 102, 255, 0.2)'
        ];
        let borderColors = [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(153, 102, 255, 1)'
        ];
        let yScaleFormatters = [
            (v) => `${Number(v).toFixed(1)} ${localUnits.fuelConsumptionAbbr()}`,
            (v) => `$ ${Number(v).toFixed(2)}`,
            (v) => `$ ${Number(v).toFixed(2)}`,
            (v) => `$ ${Number(v).toFixed(2)}`
        ];
        let isInvalidValidConsumption = value => {
            return value < 0 || driver.isMetric && value > 40 || !driver.isMetric && value > 80;
        };
        let hasFillups = false;

        while (charts.length) {
            charts.pop().destroy();
        }

        byMonth
            .sort((a, b) => {
                return new Date(a.key) - new Date(b.key);
            })
            .forEach(month => {
                labelSets[3].push(month.key);
                dataSets[3].push(month.values
                    .map(fillup => {
                        return fillup.cost;
                    })
                    .reduce((previousValue, currentValue) => {
                        return previousValue + currentValue;
                    })
                );
                month.values.forEach(fillup => {
                    let consumption = fillup.consumption;
                    let unitCost = fillup.cost / fillup.volume;
                    let isNonfuel = fillup.productType === 'NonFuel';

                    hasFillups = true;

                    if (!isNonfuel && !Number.isNaN(unitCost)) {
                        labelSets[1].push(new Date(fillup.dateTime));
                        dataSets[1].push({
                            y: unitCost,
                            x: new Date(fillup.dateTime)
                        });

                        labelSets[2].push(new Date(fillup.dateTime));
                        dataSets[2].push({
                            y: fillup.cost,
                            x: new Date(fillup.dateTime)
                        });
                    }

                    if (!isNonfuel && consumption && !isInvalidValidConsumption(parseInt(consumption, 10))) {
                        labelSets[0].push(new Date(fillup.dateTime));
                        dataSets[0].push({
                            y: parseFloat(consumption.split(' ')[0]),
                            x: new Date(fillup.dateTime)
                        });
                    }
                });
            });

        dataSets.forEach((dataSet, i) => {
            if (i > 2) {
                return;
            }
            dataSets[i].sort((a, b) => {
                return new Date(a.x) - new Date(b.x);
            });
        });


        let getChart = (type, labels, data, backgroundColor, borderColor, callback) => {
            return {
                type,
                data: {
                    labels,
                    datasets: [{
                        lineTension: 0.2,
                        label: '',
                        data,
                        backgroundColor,
                        borderColor,
                        borderWidth: 3
                    }]
                },
                options: {
                    scales: {
                        yAxes: [{
                            ticks: {
                                callback,
                                beginAtZero: true
                            }
                        }],
                        xAxes: [{
                            type: type === 'bar' ? 'category' : 'time'
                        }]
                    },
                    showTooltips: false,
                    animation: false
                }
            };
        };

        if (!hasFillups) {
            view(viewStates.noresults);
            return;
        }
        view(viewStates.charts);

        Chart.defaults.global.legend = false;

        for (let i = 0; i < labelSets.length; i++) {
            let chart = getChart(chartTypes[i], labelSets[i], dataSets[i], backgroundColors[i], borderColors[i], yScaleFormatters[i]);
            let el = document.querySelector(`#tracker-chart-${i}`);
            charts.push(new Chart(el, chart));
        }
    };

    return {
        /**
         * initialize() is called only once when the Add-In is first loaded. Use this function to initialize the
         * Add-In's state such as default values or make API requests (MyGeotab or external) to ensure interface
         * is ready for the user.
         * @param api The GeotabApi object for making calls to MyGeotab.
         * @param state The page state object allows access to URL, page navigation and global group filter.
         * @param initializeCallback Call this when your initialize route is complete. Since your initialize routine
         *        might be doing asynchronous operations, you must call this method when the Add-In is ready
         *        for display to the user.
         */
        initialize(freshApi, freshState, initializeCallback) {
            if (freshApi) {
                api = freshApi;
            }
            if (freshState) {
                state = freshState;
            }

            elContent = document.querySelector('#fuelTracker');
            elLoading = document.querySelector('.loading');
            elHeader = document.querySelector('#tracker-header');
            elTransactions = document.querySelector('#tracker-transactions');
            elCharts = document.querySelector('#tracker-charts');
            elMap = document.querySelector('#tracker-map');
            elDevice = document.querySelector('#tracker-device');
            elMenu = document.querySelector('#tracker-menu');
            elError = document.querySelector('#tracker-error');
            elNoAccess = document.querySelector('#tracker-noaccess');
            elRetry = document.querySelector('#tracker-retry');
            elNoResult = document.querySelector('#tracker-noresult');
            elDialog = document.querySelector('#tracker-dialog');
            elErrorDialog = document.querySelector('#tracker-error-dialog');
            elErrorMessage = document.querySelectorAll('.tracker-error-message');
            elDateSelect = document.querySelector('#tracker-date-select');
            elTransactionDetails = document.querySelector('#tracker-add');
            mapMarkerIcon = document.querySelector('#tracker-map-marker').getAttribute('src');
            elTransactionsPanelBtn = document.querySelector('[href="#transactions-panel"]');
            elAddPanelBtn = document.querySelector('[href="#add-panel"]');
            elChartsPanelBtn = document.querySelector('[href="#charts-panel"]');
            elMapPanelBtn = document.querySelector('[href="#map-panel"]');
            elNoDeviceDialog = document.querySelector('#tracker-no-device-dialog');

            view();

            loading(true);

            settings = getSettings();

            if (!elDialog.showModal) {
                dialogPolyfill.registerDialog(elDialog);
                dialogPolyfill.registerDialog(elErrorDialog);
                dialogPolyfill.registerDialog(elNoDeviceDialog);
            }

            elDialog.querySelector('.remove').addEventListener('click', () => {
                let id = document.querySelector('#tracker-add [data-id]').getAttribute('data-id');
                remove(id, () => {
                    elDialog.close();
                    switchMode();
                    reload(settings.period, renderList);
                    toast('', 'Success, removed fill-up');
                }, (msg, err) => {
                    elDialog.close();
                    errorHandler(msg, err);
                });
            });

            elDialog.querySelector('.close').addEventListener('click', () => {
                elDialog.close();
            });

            elNoDeviceDialog.querySelector('.yes').addEventListener('click', () => {
                elNoDeviceDialog.close();
                window.location.hash = '#workflow,(changeVehicle:!t,logout:!f,step:selectVehicle)';
            });

            elNoDeviceDialog.querySelector('.no').addEventListener('click', () => {
                elNoDeviceDialog.close();
                switchMode({
                    dateTime: new Date(),
                    volume: '',
                    cost: '',
                    odometer: '',
                    comments: '',
                    distanceAbbr: localUnits.distanceAbr(),
                    volumeAbbr: localUnits.volumeAbr()
                });
            });

            elErrorDialog.querySelector('.ok').addEventListener('click', () => {
                elErrorDialog.close();
            });

            //Brett :- adds the template references
            monthTmplFn = doT.template(document.getElementById('month-templ').text);
            transactionTmplFn = doT.template(document.getElementById('transaction-tmps').text);
            transactionDetailsTmplFn = doT.template(document.getElementById('transaction-details-tmps').text);

            if (state.translate) {
                state.translate(elContent || '');
            }

            initializeCallback();
        },

        /**
         * focus() is called whenever the Add-In receives focus.
         *
         * The first time the user clicks on the Add-In menu, initialize() will be called and when completed, focus().
         * focus() will be called again when the Add-In is revisited. Note that focus() will also be called whenever
         * the global state of the MyGeotab application changes, for example, if the user changes the global group
         * filter in the UI.
         *
         * @param api The GeotabApi object for making calls to MyGeotab.
         * @param state The page state object allows access to URL, page navigation and global group filter.
         */
        focus(freshApi, freshState) {
            // TODO: Remove when drive bug fixed, not passing in api and state to focus
            if (freshApi) {
                api = freshApi;
            }
            if (freshState) {
                state = freshState;
            }

            // console.log(`state.device.id: ${state.device.id}`);
            // console.log(`session.userName: ${session.userName}`);

            api.getSession(session => {
                api.multiCall([
                    ['Get', {
                        typeName: 'User',
                        search: {
                            name: session.userName
                        }
                    }],
                    ['Get', {
                        typeName: 'Device',
                        search: {
                            id: state.device.id
                        }
                    }],
                    ['Get', {
                        typeName: 'Group',
                        search: {
                            id: 'GroupSecurityId'
                        }
                    }]
                ], results => {
                    driver = results[0][0];
                    device = results[1][0];

                    securityCalculator = new SecurityCalculator(results[2]);

                    localUnits = new LocalUnits(driver);
                    console.log(`localUnits: ${localUnits}`);

                    api.call('Get', {
                        typeName: 'Group',
                        search: {
                            id: driver.securityGroups[0].id
                        }
                    }, groups => {
                        let uiConfiguration = securityCalculator.getUiConfiguration(groups[0]);
                        let clearances = uiConfiguration.acl;
                        let hasAddAccess = clearances.indexOf('FuelTransactionAdmin') > -1;
                        let hasViewAccess = clearances.indexOf('FuelTransactionList') > -1;
                        let hasViewDevices = clearances.indexOf('DeviceList') > -1;

                        if (!hasViewAccess || !hasAddAccess || !hasViewDevices) {
                            loading(false);
                            view(viewStates.noaccess);
                            return;
                        }

                        switchMode();

                        renderDevice();
                        reload(settings.period, renderList);

                        // event listeners
                        elMenu.addEventListener('click', e => {
                            let newPeriod = e.target.getAttribute('period');
                            let selected = document.querySelector('.is-active').getAttribute('href');
                            let cb = renderList;

                            if (selected === '#charts-panel') {
                                cb = renderChart;
                            }

                            if (selected === '#map-panel') {
                                cb = renderMap;
                            }

                            if (newPeriod) {
                                settings.period = newPeriod;
                                setSettings(settings);
                                reload(newPeriod, cb);
                            }
                        });
                        elRetry.addEventListener('click', () => {
                            let selected = document.querySelector('.is-active').getAttribute('href');
                            let cb = renderList;

                            if (selected === '#charts-panel') {
                                cb = renderChart;
                            }

                            if (selected === '#map-panel') {
                                cb = renderMap;
                            }

                            reload(settings.period, cb);
                        });
                        elTransactionsPanelBtn.addEventListener('click', () => {
                            switchMode();
                            reload(settings.period, renderList);
                        });
                        elAddPanelBtn.addEventListener('click', () => {
                            loading(false);
                            if (device === 'NoDeviceId') {
                                elNoDeviceDialog.show();
                            } else {
                                switchMode({
                                    dateTime: new Date(),
                                    volume: '',
                                    cost: '',
                                    odometer: '',
                                    comments: '',
                                    distanceAbbr: localUnits.distanceAbr(),
                                    volumeAbbr: localUnits.volumeAbr()
                                });
                            }
                        });
                        elChartsPanelBtn.addEventListener('click', () => {
                            reload(settings.period, renderChart);
                        });
                        elMapPanelBtn.addEventListener('click', () => {
                            reload(settings.period, renderMap);
                        });
                    }, errorHandler);

                }, errorHandler);
            });
        },

        /**
         * blur() is called whenever the user navigates away from the Add-In.
         *
         * Use this function to save the page state or commit changes to a data store or release memory.
         *
         * @param api The GeotabApi object for making calls to MyGeotab.
         * @param page The page state object allows access to URL, page navigation and global group filter.
         */
        blur() {
            let noop = () => { };
            elMenu.removeEventListener('click', noop);
            elRetry.removeEventListener('click', noop);
            elTransactionsPanelBtn.removeEventListener('click', noop);
            elAddPanelBtn.removeEventListener('click', noop);
            elChartsPanelBtn.removeEventListener('click', noop);
            elMapPanelBtn.removeEventListener('click', noop);
            Array.prototype.forEach.call(elTransactions.querySelectorAll('.mdl-list__item'), listItem => {
                listItem.removeEventListener('click', noop);
            });
        }
    };
};
