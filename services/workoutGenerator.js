// workoutGenerator.js - Service for generating personalized workout plans

/**
 * Calculate BMI and determine category
 */
function calculateBMI(weight, height) {
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);
  return parseFloat(bmi.toFixed(1));
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal weight';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

/**
 * Exercise templates based on goal and BMI category
 */
const exerciseTemplates = {
  'Get Fit': {
    'Underweight': {
      cardio: ['Treadmill Walking', 'Stationary Bike', 'Elliptical', 'Light Jogging'],
      strength: ['Push-ups', 'Bodyweight Squats', 'Lunges', 'Plank', 'Mountain Climbers', 'Dumbbell Rows'],
      flexibility: ['Yoga Stretches', 'Dynamic Stretching']
    },
    'Normal weight': {
      cardio: ['Treadmill Running', 'Cycling', 'Rowing Machine', 'Jump Rope'],
      strength: ['Push-ups', 'Pull-ups', 'Squats', 'Deadlifts', 'Bench Press', 'Shoulder Press', 'Lat Pulldowns'],
      flexibility: ['Full Body Stretching', 'Foam Rolling']
    },
    'Overweight': {
      cardio: ['Treadmill Walking', 'Swimming', 'Elliptical', 'Stationary Bike'],
      strength: ['Wall Push-ups', 'Assisted Squats', 'Seated Rows', 'Leg Press', 'Chest Press', 'Leg Curls'],
      flexibility: ['Gentle Stretching', 'Chair Yoga']
    },
    'Obese': {
      cardio: ['Treadmill Walking', 'Water Aerobics', 'Recumbent Bike', 'Chair Exercises'],
      strength: ['Wall Push-ups', 'Seated Exercises', 'Resistance Band Exercises', 'Light Weights'],
      flexibility: ['Seated Stretching', 'Gentle Mobility Exercises']
    }
  },
  
  'Lose Weight': {
    'Underweight': {
      cardio: ['Light Cardio Walking', 'Gentle Cycling', 'Swimming'],
      strength: ['Bodyweight Exercises', 'Light Resistance Training', 'Core Strengthening'],
      flexibility: ['Yoga', 'Pilates']
    },
    'Normal weight': {
      cardio: ['High Intensity Interval Training', 'Running', 'Cycling', 'Rowing', 'Burpees'],
      strength: ['Circuit Training', 'Compound Movements', 'Kettlebell Swings', 'Battle Ropes'],
      flexibility: ['Dynamic Warm-up', 'Cool-down Stretches']
    },
    'Overweight': {
      cardio: ['Brisk Walking', 'Swimming', 'Elliptical', 'Low-impact Aerobics', 'Cycling'],
      strength: ['Full Body Circuit', 'Functional Movements', 'Core Training', 'Resistance Exercises'],
      flexibility: ['Joint Mobility', 'Stretching Routine']
    },
    'Obese': {
      cardio: ['Walking', 'Water Exercises', 'Seated Cardio', 'Low-impact Movement'],
      strength: ['Chair Exercises', 'Resistance Bands', 'Light Weight Training', 'Isometric Exercises'],
      flexibility: ['Gentle Stretching', 'Range of Motion Exercises']
    }
  },
  
  'Gain Weight': {
    'Underweight': {
      cardio: ['Light Walking', 'Easy Cycling'],
      strength: ['Heavy Compound Lifts', 'Squats', 'Deadlifts', 'Bench Press', 'Pull-ups', 'Overhead Press', 'Barbell Rows'],
      flexibility: ['Dynamic Stretching', 'Mobility Work']
    },
    'Normal weight': {
      cardio: ['Moderate Cardio', 'HIIT'],
      strength: ['Progressive Overload Training', 'Compound Movements', 'Isolation Exercises', 'Heavy Lifting'],
      flexibility: ['Pre-workout Mobility', 'Post-workout Stretching']
    },
    'Overweight': {
      cardio: ['Moderate Cardio', 'Interval Training'],
      strength: ['Strength Training', 'Functional Movements', 'Progressive Loading'],
      flexibility: ['Full Body Stretching', 'Mobility Training']
    },
    'Obese': {
      cardio: ['Low-impact Cardio', 'Walking', 'Swimming'],
      strength: ['Basic Strength Training', 'Functional Exercises', 'Progressive Training'],
      flexibility: ['Joint Mobility', 'Flexibility Training']
    }
  },
  
  'Body Building': {
    'Underweight': {
      cardio: ['Minimal Cardio', 'Walking'],
      strength: ['Heavy Compound Lifts', 'Isolation Exercises', 'Progressive Overload', 'Split Training'],
      flexibility: ['Targeted Stretching', 'Muscle Recovery']
    },
    'Normal weight': {
      cardio: ['Moderate Cardio', 'HIIT'],
      strength: ['Advanced Lifting', 'Muscle Isolation', 'Volume Training', 'Progressive Overload'],
      flexibility: ['Muscle-specific Stretching', 'Recovery Work']
    },
    'Overweight': {
      cardio: ['Moderate Cardio', 'Fat Burning Cardio'],
      strength: ['Strength Training', 'Muscle Building', 'Compound Movements'],
      flexibility: ['Full Body Mobility', 'Recovery Stretching']
    },
    'Obese': {
      cardio: ['Progressive Cardio', 'Low-impact Training'],
      strength: ['Foundation Building', 'Progressive Strength Training', 'Functional Movements'],
      flexibility: ['Joint Health', 'Basic Flexibility']
    }
  }
};

/**
 * Generate specific exercise with reps/duration
 */
function generateExerciseDetails(exerciseName, goal, bmiCategory, dayIndex) {
  // Always start with Bicep Curl for exercise #1
  if (exerciseName === 'Bicep Curl') {
    return {
      name: 'Bicep Curl',
      reps: '20 reps',
      duration: null,
      notes: 'Use appropriate dumbbell weight for your fitness level'
    };
  }
  
  // Cardio exercises (time-based)
  const cardioExercises = ['Treadmill', 'Cycling', 'Running', 'Walking', 'Elliptical', 'Rowing', 'Swimming', 'HIIT', 'Jump Rope', 'Stationary Bike', 'Recumbent Bike'];
  const isCardio = cardioExercises.some(cardio => exerciseName.includes(cardio));
  
  if (isCardio) {
    let duration;
    if (goal === 'Lose Weight') {
      duration = bmiCategory === 'Obese' ? '10 min' : bmiCategory === 'Overweight' ? '15 min' : '20 min';
    } else if (goal === 'Body Building') {
      duration = '10 min';
    } else {
      duration = bmiCategory === 'Obese' ? '8 min' : '12 min';
    }
    
    return {
      name: exerciseName,
      reps: null,
      duration: duration,
      notes: 'Maintain steady pace, adjust intensity as needed'
    };
  }
  
  // Strength exercises (rep-based)
  let reps, sets;
  
  if (goal === 'Body Building') {
    sets = 4;
    reps = bmiCategory === 'Underweight' ? 8 : 10;
  } else if (goal === 'Gain Weight') {
    sets = 3;
    reps = bmiCategory === 'Underweight' ? 6 : 8;
  } else if (goal === 'Lose Weight') {
    sets = 3;
    reps = bmiCategory === 'Obese' ? 8 : 12;
  } else { // Get Fit
    sets = 3;
    reps = bmiCategory === 'Obese' ? 6 : 10;
  }
  
  return {
    name: exerciseName,
    reps: `${reps} reps × ${sets} sets`,
    duration: null,
    notes: 'Rest 60-90 seconds between sets'
  };
}

/**
 * Generate 7-day workout plan
 */
function generateWeeklyPlan(goal, bmi, bmiCategory) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const template = exerciseTemplates[goal][bmiCategory];
  const weeklyPlan = [];
  
  // Create exercise pool
  const allExercises = [...template.cardio, ...template.strength, ...template.flexibility];
  
  days.forEach((day, dayIndex) => {
    const dayPlan = {
      day: day,
      exercises: []
    };
    
    // Exercise #1 is always Bicep Curl
    dayPlan.exercises.push(generateExerciseDetails('Bicep Curl', goal, bmiCategory, dayIndex));
    
    // Generate remaining 7 exercises
    const selectedExercises = [];
    const exercisePool = [...allExercises];
    
    // Ensure variety: include cardio, strength, and flexibility
    const cardioCount = goal === 'Lose Weight' ? 3 : goal === 'Body Building' ? 1 : 2;
    const strengthCount = goal === 'Body Building' ? 5 : goal === 'Gain Weight' ? 4 : 3;
    const flexibilityCount = 7 - cardioCount - strengthCount;
    
    // Add cardio exercises
    for (let i = 0; i < cardioCount && template.cardio.length > 0; i++) {
      const randomCardio = template.cardio[Math.floor(Math.random() * template.cardio.length)];
      selectedExercises.push(randomCardio);
    }
    
    // Add strength exercises
    for (let i = 0; i < strengthCount && template.strength.length > 0; i++) {
      const randomStrength = template.strength[Math.floor(Math.random() * template.strength.length)];
      selectedExercises.push(randomStrength);
    }
    
    // Add flexibility exercises
    for (let i = 0; i < flexibilityCount && template.flexibility.length > 0; i++) {
      const randomFlex = template.flexibility[Math.floor(Math.random() * template.flexibility.length)];
      selectedExercises.push(randomFlex);
    }
    
    // Fill remaining slots if needed
    while (selectedExercises.length < 7) {
      const randomExercise = allExercises[Math.floor(Math.random() * allExercises.length)];
      selectedExercises.push(randomExercise);
    }
    
    // Generate exercise details for each selected exercise
    selectedExercises.forEach(exercise => {
      dayPlan.exercises.push(generateExerciseDetails(exercise, goal, bmiCategory, dayIndex));
    });
    
    weeklyPlan.push(dayPlan);
  });
  
  return weeklyPlan;
}

/**
 * Main function to generate complete workout plan
 */
function generateWorkoutPlan(userEmail, weight, height, goal) {
  const bmi = calculateBMI(weight, height);
  const bmiCategory = getBMICategory(bmi);
  const weeklyPlan = generateWeeklyPlan(goal, bmi, bmiCategory);
  
  return {
    userEmail: userEmail.toLowerCase().trim(),
    bmi: bmi,
    bmiCategory: bmiCategory,
    goal: goal,
    weeklyPlan: weeklyPlan
  };
}

module.exports = {
  generateWorkoutPlan,
  calculateBMI,
  getBMICategory
};