const {
    strings : {singular, upperFirst}
} = require('gluegun');

const {getSequelizeModel} = require('./sequelizeUtils')
const convertSequelizeToSwaggerTypes = require('./swaggerConvert')

// Returns the properties needed to populate the template

function buildTemplateProperties(model, database, path=null, path_to_model=null, path_to_app = null) {

    // Initialize properties to build the template with

    let props = {
        path_to_model : path_to_model,
        path_to_app : path_to_app,
        path : path,
        model : null,
        model_def : null,
        model_single : null,
        model_id : null,
        model_data : [],
        model_properties : []
    }
    
    // If a model is selected add more properties to the props object

    if (model) {
        const model_obj = getSequelizeModel(model,database);
        let attrs = model_obj['tableAttributes'];
        let model_id = model_obj['primaryKeyAttribute'];
        for (let attr_name in attrs) {
            let type = convertSequelizeToSwaggerTypes(attrs[attr_name].type.key)
            if(attrs[attr_name].fieldName == model_id){
                props.model_id_type = type
            }
            if(!attrs[attr_name]._autoGenerated && !attrs[attr_name].autoIncrement){
                props.model_data.push({
                    type : type,
                    name : attrs[attr_name].fieldName
                })
            }
            props.model_properties.push(
                {
                    type : type,
                    fieldName : attrs[attr_name].fieldName
                }
            )
        }
        props.model = model;
        props.model_single = singular(model);
        props.model_id = model_id;
        props.model_def = upperFirst(singular(model));
    }

    return props;
}

module.exports = buildTemplateProperties