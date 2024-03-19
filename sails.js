/*
    Copyright © 2024 Inspired Technologies

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
*/
const { v4: uuidv4 } = require('uuid');
let APPTOKEN
const APITOKEN = 'SignalKApi/v1' // TODO: needed?
let PLUGINID
let refreshRate
let pluginProps
let updatePluginProps
let restartPlugin
let IDs = []
let Sails = []
let States = []
let Specification = []
let Inventory = []
let updateVal = {}
let sendVal
let getVal
let log

// const convert = require ('./skunits')
const pathPrefix = "sails.";
const sailInventory = pathPrefix + "inventory"
const sailArea = pathPrefix + "area"
const sailAreaTotal = pathPrefix + "area.total"
const sailAreaActive = pathPrefix + "area.active"
// const navigationState = 'navigation.state'

const init = (config, pluginid, token, refresh, loghandler) => {
    PLUGINID = pluginid
    APPTOKEN = token
    log = loghandler
    refreshRate = refresh ? refresh>0 ? refresh : undefined : undefined 
    // Sails & States derived from config
    config.forEach(sail => {
        IDs[sail.label] = sail.id
        Sails[sail.label] = sail.state && sail.state > 0 ? 
        {
           reduced: sail.states[sail.state-1].value!=1,
           reefs: sail.state-1,
           furledRatio: 1-sail.states[sail.state-1].value
        }
       : null
       States[sail.label] = sail.states.map(s => s.name)
       let reef = 0
       sail.states.forEach(state => {
        States[sail.label][state.name] = {
            reduced: state.value!=1,
            reefs: reef++,
            furledRatio: 1-state.value 
        }
       })
       Inventory.push({
        label: sail.label,
        active: sail.hasOwnProperty("state")
       })
       Specification[sail.label] = {
        name: sail.name,
        type: sail.type,
        material: sail.material,
        brand: sail.brand,
        area: { value: sail.area, units: "sqm" },
        wind: {
            minimum: { value: sail.wind.min, units: "m/s" },
            maximum: { value: sail.wind.max, units: "m/s" }
        }
       }
    })
    log(`Accepting PUT calls via token ${APPTOKEN}`)
    return true
}

const update = (props, update, restart) => {
    pluginProps = props
    updatePluginProps = update
    restartPlugin = restart
}

function register (subscribe, sails, get, send, status) {
    status('Registering');
    let metas = []
  
    // do some initialization
    putHandlers = []
    sails.map(sail => 
    {
        putHandlers.push(
            { path: pathPrefix+sail.label, source: APPTOKEN, type: 'state', description: `Current sail configuration of ${sail.label} sail`  }
        )
    })

    updateVal[sailAreaTotal] = { updated: new Date(Date.now()).toISOString(), value: null, refresh: refreshRate }
    metas.push(buildDeltaUpdate(sailAreaTotal, { units: 'm2', timeout: refreshRate, description: 'The total area of all sails on the vessel' }))
    updateVal[sailAreaActive] = { updated: new Date(Date.now()).toISOString(), value: null, refresh: refreshRate}
    metas.push(buildDeltaUpdate(sailAreaActive, { units: 'm2', timeout: refreshRate, description: 'The total area of the sails currently in use on the vessel' }))
    updateVal[sailArea] = { updated: new Date(Date.now()).toISOString(), value: null, refresh: refreshRate }
    metas.push(buildDeltaUpdate(sailAreaTotal, { units: 'm2', timeout: refreshRate, description: "An object containing information about the vessels' sails" }))

    if (putHandlers.length>0)
    {
        log("Registering PUT Handler ...")
        putHandlers.forEach(h => {
            subscribe('vessels.self', h.path, handlePutCall, h.source)
            let value = {}
            if (h.hasOwnProperty('description')) value.description = h.description 
            if (h.hasOwnProperty('timeout')) value.timeout = h.timeout 
            if (value.hasOwnProperty('unit')) metas.push(buildDeltaUpdate(h.path, value))
            updateVal[h.path] = { value: null, type: h.type, refresh: h.timeout }
            // if (h.hasOwnProperty('map')) get.publish(h.path, h.map, h.type)
            log(`Handler for '${h.path}' registered for ${h.source}`)
          })
    }

    if (metas.length>0)
        send.meta(metas)

    getVal = get.read;
    sendVal = send.delta;    
    status('Registered');
    return true;   
}

function sailState (reef, ratio)
{
    // unset
    if ((reef===undefined || reef===null || typeof reef !== 'number') && (ratio===undefined || ratio===null || typeof ratio !== 'number'))
        return null;
    // only ratio
    if ((reef===undefined || reef===null) && ratio>=0 && ratio<=1)
        return {
            reduced: ratio!==0,
            reefs: 1,
            furledRatio: ratio
        }
    // only reef
    else if ((ratio===undefined || ratio===null) && reef>=0 && reef<=5)
        return {
            reduced: reef>0,
            reefs: Math.round(reef),
            furledRatio: Math.round(reef)*0.2
        }
    // both values
    else if (reef>=0 && reef<=5 && ratio>=0 && ratio<=1)
        return {
            reduced: reef>0 || ratio!==0,
            reefs: Math.round(reef),
            furledRatio: ratio
        }
    // invalid
    else
        return null
}

function buildDeltaUpdate(path, value) {
    return {
        path: path,
        value: value
    }
  }

function handlePutCall (context, path, value, callback) {
    let error = false
    let errMsg = ''
    let update = []
    let index = putHandlers.findIndex(function(item, i) {return item.path === path })+1;
    let handler = PLUGINID + (index ? '.'+index : '')
    let sail = path.replace(pathPrefix, "")
    index = Inventory.findIndex(s => s.label===sail)
    if (index===-1){
        error = true; 
        errMsg = `'${sail}' not found in Inventory`
        log(`${handler}: couldn't update '${path}', error: ${errMsg}`)
    }
  
    if (!error && context === 'vessels.self') {
        if (value===null)
        {
            updateVal[path].updated = new Date(Date.now()).toISOString()
            updateVal[path].value = null
            update.push(buildDeltaUpdate(path, updateVal[path].value))
            Inventory[index].active = false
        } else if (value===undefined || !(value.hasOwnProperty('reefs') || value.hasOwnProperty('furledRatio') || value.hasOwnProperty('state'))) {
            error = true; 
            errMsg = `Type mismatch: '${typeof value}' doesn't match '${updateVal[path].type}'`
            log(`${handler}: couldn't update '${path}', error: ${errMsg}`)
        } else if (value && value!==null && updateVal[path].type==='state' && value.hasOwnProperty('state') && typeof value.state==='number') {
            let reef = States[sail][value.state-1]
            let state = States[sail][reef]
            if (value.state === 0)
            {   // unpublish sail
                updateVal[path].updated = new Date(Date.now()).toISOString()
                updateVal[path].value = null
                update.push(buildDeltaUpdate(path, updateVal[path].value))
                Inventory[index].active = false
            }
            else if (reef === undefined || state === undefined)
            {
                error = true;
                errMsg = `State not found - '${value.state}' doesn't match, valid states are '${States[sail].map(s => s)}'`
                log(`${handler}: couldn't update '${path}', error: ${errMsg}`)    
            } else {
                updateVal[path].updated = new Date(Date.now()).toISOString()
                updateVal[path].value = state
                update.push(buildDeltaUpdate(path, updateVal[path].value))
                Inventory[index].active = true
            }
        } else if (value && value!==null && updateVal[path].type==='state' && value.hasOwnProperty('state') && typeof value.state==='string') {
            let state = States[sail][value.state]
            if (state === undefined)
            {
                error = true;
                errMsg = `State not found - '${value.state}' doesn't match, valid states are '${States[sail].map(s => s)}'`
                log(`${handler}: couldn't update '${path}', error: ${errMsg}`)    
            } else {
                updateVal[path].updated = new Date(Date.now()).toISOString()
                updateVal[path].value = state
                update.push(buildDeltaUpdate(path, updateVal[path].value))
                Inventory[index].active = true
            }
        } else if (value && value!==null && updateVal[path].type==='state' && sailState(value.reefs, value.furledRatio)===null) {
            error = true; 
            errMsg = "Value mismatch: content of '"+ typeof value + "' doesn't match '" + updateVal[path].type +"'"
            log(`${handler}: couldn't update '${path}', error: ${errMsg}`)
        } else if (value && value!==null && updateVal[path].type==='state') {
            updateVal[path].updated = new Date(Date.now()).toISOString()
            updateVal[path].value = sailState(value.reefs, value.furledRatio)
            Inventory[index].active = true
            update.push(buildDeltaUpdate(path, updateVal[path].value))
        }
        // update area values
        updateVal[sailAreaTotal].updated = new Date(Date.now()).toISOString()
        updateVal[sailAreaTotal].value = Inventory.map(s => Specification[s.label].area.value).reduce((sum, a) => sum+a, 0);
        update.push(buildDeltaUpdate(sailAreaTotal, updateVal[sailAreaTotal].value))
        updateVal[sailAreaActive].updated = new Date(Date.now()).toISOString()
        updateVal[sailAreaActive].value = Inventory.map(s => s.active ? Specification[s.label].area.value * (1-updateVal['sails.'+s.label].value.furledRatio) : 0).reduce((sum, a) => sum+a, 0);
        update.push(buildDeltaUpdate(sailAreaActive, updateVal[sailAreaActive].value))
        updateVal[sailArea].updated = new Date(Date.now()).toISOString()
        updateVal[sailArea].value = { "count": Inventory.length, "total": updateVal[sailAreaTotal].value, "active": updateVal[sailAreaActive].value }
        update.push(buildDeltaUpdate(sailArea, updateVal[sailArea].value))
    }

    if (!error && update.length>0) 
    {
        sendVal(update)
        Sails[sail] = updateVal[path].value
        log( { [[handler]]: update[0] } )
    }
  
    if (!error)
        return {
            state: 'COMPLETED',
            statusCode: 200
       }
    else
        return {
            state:'COMPLETED',
            statusCode: 400,
            message: errMsg
       }
}

function config (active) {
    let updates = []
    active.forEach(sail => {
        updateVal[pathPrefix+sail].updated = new Date(Date.now()).toISOString()
        updateVal[pathPrefix+sail].value = Sails[sail]
        updates.push(buildDeltaUpdate(pathPrefix+sail, updateVal[pathPrefix+sail].value))
    })
    return updates
}

function inventory (req, res, next) {
    let results = []
    Inventory.forEach(sail => {
        let result = {}
        if (req.query.hasOwnProperty("mode") && req.query.mode=="export")
        {
            result.id = IDs[sail.label]
            result.label = sail.label
            result.states = []
            for (i=0; i<States[sail.label].length; i++)
                result.states.push({
                    "units": i,
                    "value": -1*States[sail.label][States[sail.label][i]].furledRatio+1
                })
        }
        result.name = Specification[sail.label].name,
        result.type = Specification[sail.label].type,
        result.material = Specification[sail.label].material,
        result.brand = Specification[sail.label].brand,
        result.area = Specification[sail.label].area,
        result.wind = Specification[sail.label].wind        
        if (result)
        {
            result.active = sail.active
            results.push(result)
        }
    })
    res.type('application/json')
    res.json(results)
    log(`${results.length} sails listed`)
    res.status(200)
}

function endpoint (req, res, next) {
    let data = req.body
    let statusCode = 200
    let idx = -1
    let result = {}
    if (!data || (typeof data==='object' && Object.keys(data).length===0))
    {
        let err = "Sail data not provided or invalid"
        log(err)
        res.status(400).send(err)
        next()
        return
    } else {
        try {
            if (data.hasOwnProperty('id') && data.hasOwnProperty('label') && pluginProps.sails.map(s => s.id).indexOf(data.id)!==-1)
            {   // id provided and exists -> check label and update
                idx = pluginProps.sails.map(s => s.id).indexOf(data.id)
                if (data.label===pluginProps.sails[idx].label)
                    statusCode = 200
                else
                    statusCode = 404
            }
            else if (data.hasOwnProperty('label') && pluginProps.sails.map(s => s.label).indexOf(data.label)!==-1)
            {   // id not provided but label exists -> update
                idx = pluginProps.sails.map(s => s.label).indexOf(data.label)
                statusCode = 200
            }
            else if (data.hasOwnProperty('label'))
            {   // id not provided and label doesn't exist -> create and return ID
                if (!data.hasOwnProperty('label') || typeof data.label!=="string" || data.label.length===0) 
                    statusCode = 400               
                else if (!data.hasOwnProperty('name') || typeof data.name!=="string" || data.name.length===0)
                    statusCode = 400               
                else if (!data.hasOwnProperty('material') || typeof data.material!=="string")
                    statusCode = 400               
                else if (!data.hasOwnProperty('brand') || typeof data.brand!=="string")
                    statusCode = 400               
                else if (!data.hasOwnProperty('type') || typeof data.type!=="string" || data.type.length===0)
                    statusCode = 400               
                else if (!data.hasOwnProperty('area') || typeof data.area!=="object" || !data.area.hasOwnProperty('value') || typeof data.area.value!=="number" || data.area.value===0)
                    statusCode = 400               
                else if (!data.hasOwnProperty('wind') || typeof data.wind!=="object" || !data.wind.hasOwnProperty('minimum') || !data.wind.hasOwnProperty('maximum') || 
                    typeof data.wind.minimum!=="object" || typeof data.wind.maximum!=="object" || data.wind.minimum.value>=data.wind.maximum.value)
                    statusCode = 400
                else if (data.hasOwnProperty('states') && !Array.isArray(data.states))
                    statusCode = 400
                else
                    statusCode = 201
            }
            else
            {   // not enough data to work on
                let err = "Sail data not provided or invalid"
                log(err)
                res.status(400).send(err)
                next()
                return
            }
            if (statusCode===201)
            {
                let result = {
                    id: uuidv4(),
                    label: data.label,
                    name: data.name,
                    material: data.material,
                    brand: data.brand,
                    type: data.type,
                    area: data.area.value,
                    wind: {
                        min: data.wind.minimum.value,
                        max: data.wind.maximum.value
                    },
                    states: [ {
                        "name": "Full",
                        "value": 1
                      } ]
                }
                data.states.forEach(s => {
                    let name = ""
                    let value
                    if (s.hasOwnProperty('name') && typeof s.name==="string")
                        name = s.name
                    else if (s.hasOwnProperty('units') && typeof s.units==="number" && s.units===0)
                        name = "Full"
                    else if (s.hasOwnProperty('units') && typeof s.units==="number")
                        name = "Reef "+s.units
                    else
                        statusCode = 400
                    if (s.hasOwnProperty('value') && typeof s.value==="number")
                        value = s.value
                    else
                        value = 1
                    if (name!=="Full")
                        result.states.push({
                            name: name,
                            value: value
                    })
                })
                log(result)
                pluginProps.sails.push(result)
                idx = pluginProps.sails.map(s => s.id).indexOf(result.id)
                updatePluginProps(pluginProps, () => { log('Plugin configuration updated!') })
                res.status(statusCode).send(`Sail ${data.label} created with id ${pluginProps.sails[idx].id}`)
                next()
                return    
            } else if (statusCode===200) {
                if (data.hasOwnProperty('name') && typeof data.name==="string" && data.name.length!==0)
                    pluginProps.sails[idx].name = data.name
                if (data.hasOwnProperty('material') && typeof data.material==="string" && data.material.length!==0)
                    pluginProps.sails[idx].material = data.material
                if (data.hasOwnProperty('brand') && typeof data.brand==="string" && data.brand.length!==0)
                    pluginProps.sails[idx].brand = data.brand
                if (data.hasOwnProperty('type') && typeof data.type==="string" && data.type.length!==0)
                    pluginProps.sails[idx].type = data.type
                if (data.hasOwnProperty('area') && typeof data.area==="number" && data.area>0)
                    pluginProps.sails[idx].area = data.area
                if (data.hasOwnProperty('wind') && typeof data.wind!=="object" && data.wind.hasOwnProperty('min') && data.win.hasOwnProperty('max'))
                    pluginProps.sails[idx].wind = data.wind
                if (data.hasOwnProperty('states') && Array.isArray(data.states) && data.states.length>0)
                {
                    result = [ {
                        "name": "Full",
                        "value": 1
                      } ]
                    data.states.forEach(s => {
                        let name = ""
                        let value
                        if (s.hasOwnProperty('name') && typeof s.name==="string")
                            name = s.name
                        else if (s.hasOwnProperty('units') && typeof s.units==="number" && s.units===0)
                            name = "Full"
                        else if (s.hasOwnProperty('units') && typeof s.units==="number")
                            name = "Reef "+s.units
                        else
                            statusCode = 400
                        if (s.hasOwnProperty('value') && typeof s.value==="number")
                            value = s.value
                        else
                            value = 1
                        if (name!=="Full")
                            result.push({
                                name: name,
                                value: value
                        })
                    })
                    pluginProps.sails[idx].states = result
                }
                updatePluginProps(pluginProps, () => { log('Plugin configuration updated!') })
                result = Specification[data.label]
            } else {
                log(`Provided data for sail ${data.label} is invalid`)
                res.status(statusCode).send(`Invalid data for sail ${data.label}`)
                next()
                return    
            }
            log(`Inventory update processed for ${data.label}`)
        } catch (err) {
            log(err.message)
            res.status(500).send(err.message)
            next()
            return
        }
    }
    res.type('application/json')
    res.json(result)
    res.status(statusCode)
}

function list (active) {
    let result = []
    Inventory.forEach(sail => { 
        if (active && sail.active)
            result.push(sail.label)
        else if (!active)
            result.push(sail.label)
    })
    return result
}

function spec (req, res, next) {
    let label = req.route.path.split('/')[req.route.path.split('/').length-1]
    res.type('application/json')
    res.json(Specification[label]===undefined ? {} : Specification[label])
    log(`Specification of ${label}${Specification[label]===undefined ? " not " : " "}retrieved`)
    res.status(200)
}

const stop = () => {}

module.exports = {
    init,            // initialize SailConfig
    register,        // register Put Handler
    config,          // provide current sails configuration
    list,            // list sails in the inventory
    inventory,       // inventory endpoint
    update,          // config updates
    endpoint,        // create or update endpoint
    spec,            // specification endpoint
    stop,            // stop actions
}