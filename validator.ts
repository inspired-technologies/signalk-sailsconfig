import { Validator } from 'fluentvalidation-ts';

type Sail = {
  id: string;
  name: string;
  description: string;
  // type: Enumerator<'mainsail' | 'jib' | 'genoa' | 'spinnaker' | 'gennaker' | 'staysail' | 'headsail' | 'lug' | 'mizzen' | 'steadying sail' | 'other'>;
  type: string;
  material: string;
  brand: string;
  active: boolean;
  area: number;
  minimumWind: number;
  maximumWind: number;
  reefs: Array<number>;
  continuousReefing?: boolean;  
  reducedState: {
    reefs: number;
    furledRatio: number;
  }
};

type Update = {
  id: string;
  active: boolean;
  reducedState?: {
    reefs?: number;
    furledRatio?: number;    
  }
}

type Status = {
  value: boolean
}

type State = {
  reefs?: number;
  furledRatio?: number;    
}

class SailValidator extends Validator<Sail> {
  constructor() {
    super();

    let types = [
          'mainsail',
          'jib',
          'genoa',
          'spinnaker',
          'gennaker',
          'staysail',
          'headsail',
          'lug',
          'mizzen',
          'steadying sail',
          'other'
        ]
  
    // This is type-safe! (Argument is of type 'id' | 'name')
    this.ruleFor('id') 
      .notUndefined()
      .notEmpty()
      .matches(/^[a-zA-Z0-9-\s]+$/)
      .withMessage('Provide a unique sail ID!');

    this.ruleFor('name')
      .notUndefined()
      .notEmpty().minLength(2)
      .matches(/^[a-zA-Z0-9\s]+$/)
      .withMessage('Please enter a valid name for the sail!');

    this.ruleFor('description')
      .notEmpty().maxLength(200)
      .withMessage('Maximum length of description is 200 characters!');

    this.ruleFor('type')
      .notUndefined()
      .must(value => types.indexOf(value)!==-1)
      .withMessage('Sail type must be one of: mainsail, jib, genoa, spinnaker, gennaker, staysail, headsail, lug, mizzen, steadying sail, other!');
    
    this.ruleFor('material')
      .minLength(0).maxLength(50)
      .withMessage('Maximum length of material is 50 characters!');

    this.ruleFor('brand')
      .minLength(0).maxLength(50)
      .withMessage('Maximum length of brand is 50 characters!');

    this.ruleFor('active')
      .must(value => typeof value === 'boolean')
      .withMessage('Active must be a boolean value!');      
    
    this.ruleFor('area')
      .notUndefined()
      .greaterThan(0)
      .withMessage('Size of sail must be given and cannot be negative!');

    this.ruleFor('minimumWind')
      .greaterThanOrEqualTo(0)
      .withMessage('Minimum wind must be a positive number!');

    this.ruleFor('maximumWind')
      .greaterThanOrEqualTo(0)
      .withMessage('Maximum wind must be a positive number!');

    this.ruleFor('reefs')
      .notUndefined()
      .must(value => Array.isArray(value) && value.every(r => typeof r === 'number' && r > 0))
      .withMessage('Reefs must be an array of non-negative numbers!')
      .when((model: Sail) => model.continuousReefing === false);

    this.ruleForEach('reefs')
      .greaterThan(0)
      .withMessage('Please enter a positive area for each reef!')
      .when((model: Sail) => model.reefs.length>0);
    
    this.ruleFor('continuousReefing')
      .must(value => typeof value === 'boolean')
      .withMessage('Continuous reefing must be a boolean value!');

    this.ruleFor('reducedState')
      .must(value => 
        typeof value === 'object' && 
        value !== null && 
        (typeof value.reefs === 'number' && value.reefs >= 0 || 
         typeof value.furledRatio === 'number' && value.furledRatio >= 0 && value.furledRatio <= 1)
      )
      .withMessage('Reduced state must be an object with non-negative reefs and furledRatio values!');

    this.ruleFor('reducedState').setValidator((sail) => 
      new StateValidator((sail as Sail).reefs ? (sail as Sail).reefs.length : undefined));
    }
}

class UpdateValidator extends Validator<Update> {
  constructor(availableReefs?: number) {
    super(); 

    this.ruleFor('id') 
      .notUndefined()
      .notEmpty()
      .matches(/^[a-zA-Z0-9-\s]+$/)
      .withMessage('Provide a unique sail ID!');
    
    this.ruleFor('active')
      .notUndefined()
      .must(value => typeof value === 'boolean')
      .withMessage('Active must be a boolean value!');

    this.ruleFor('reducedState')
      .must(value => 
        typeof value === 'object' && value !== null && 
        (typeof value.reefs === 'number' && value.reefs >= 0 || 
         typeof value.furledRatio === 'number' && value.furledRatio >= 0 && value.furledRatio <= 1)
      )
      .withMessage('Reduced state must be an object with non-negative reefs and furledRatio values!');

    this.ruleFor('reducedState').setValidator((state) => 
      new StateValidator(availableReefs));
    }
  }

class StatusValidator extends Validator<Status> {
  constructor() {
    super();  
    this.ruleFor('value')
      .notUndefined()
      .must(value => typeof value === 'boolean')
      .withMessage('Value must be a boolean!');
    }
  }

class StateValidator extends Validator<State> {
  constructor(availablereefs?: number) {
    super();

    this.ruleFor('reefs')
      .notUndefined()
      .must(value => typeof value === 'number' && value >= 0 && (availablereefs === undefined || value <= availablereefs))
      .withMessage(`Reefs must be a non-negative number${availablereefs === undefined ? '!' : ' and smaller than '+availablereefs}!`)
      .when((state) => (state as State).furledRatio === undefined);
    this.ruleFor('furledRatio')
      .notUndefined()
      .must(value => typeof value === 'number' && value >= 0 && value <= 1)
      .withMessage('Furled ratio must be a number between 0 and 1!')
      .when((state) => (state as State).reefs === undefined);
    }
  }

export { SailValidator, UpdateValidator, StatusValidator, StateValidator };