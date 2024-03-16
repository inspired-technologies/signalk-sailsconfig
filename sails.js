/*
    Copyright © 2022 Inspired Technologies

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
*/
let APPTOKEN
const APITOKEN = 'SignalKApi/v1' // TODO: needed?
let PLUGINID
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

const init = (config, pluginid, token, loghandler) => {
    PLUGINID = pluginid
    APPTOKEN = token
    log = loghandler
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

function register (subscribe, sails, get, send, status) {
    status('Registering');
    let metas = []
  
    // do some initialization
    postHandlers = [
      { path: sailInventory, unit: '', source: APITOKEN, type: 'sail', description: 'An object containing a description of each sail available to the vessel crew' }
    ]
    putHandlers = []
    sails.map(sail => 
    {
        putHandlers.push(
            { path: pathPrefix+sail.label, source: APPTOKEN, type: 'state', description: `Current sail configuration of ${sail.label} sail`  }
        )
    })

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
    if (false && postHandlers.length>0)
    {
        log("Registering POST Handler ...")
        postHandlers.forEach(h => {
            let value = {}
            if (h.hasOwnProperty('description')) value.description = h.description 
            if (h.hasOwnProperty('timeout')) value.timeout = h.timeout 
            if (value.hasOwnProperty('unit')) metas.push(buildDeltaUpdate(h.path, value))
            updateVal[h.path] = { value: null, type: h.type, refresh: h.timeout }
            if (h.hasOwnProperty('map')) get.publish(h.path, h.source+"|>"+h.map, h.type)
            log(`'${h.path}' registered for publishing via ${h.source}`)
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
  
    if (context === 'vessels.self') {
        // let currentVal = getVal(path)
        if (value===null)
        {
            updateVal[path].updated = new Date(Date.now()).toISOString()
            updateVal[path].value = null
            update.push(buildDeltaUpdate(path, updateVal[path].value))
            Inventory[index].active = false
        }
        else if (value===undefined || !(value.hasOwnProperty('reefs') || value.hasOwnProperty('furledRatio') || value.hasOwnProperty('state'))) {
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
    inventory,       // inventory endpooint
    spec,            // specification endpooint
    // handle,       // handle Delta Updates
    stop,            // stop actions
}