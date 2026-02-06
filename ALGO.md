# Mentora Algorithm

## Course Priority Calculation
For each course:
* course_credit_value (this will be gathered from the academic history of the user)
* course_importance (user rated)
* exam_dates (user will enter this)
    * upcoming_exam_date
* assignment_dates (use will enter this)
    * upcoming_assignment_deadline
    * total_effort (this can be gathered from the ECTS)
    * remaining_effort (total_effort - user_study_history_for_this_task)
    * days_until_next_deadline (deadline_date - today)


## Emotion Calculation

Emotions affect the parameters with their overall score. Emotions also have effect on the specific features solely (e.g., anger means the task is too difficult and we may offer some help somehow)

Surprise emotion doesn't affect overall score since surprise means something is out of expectations (either too good or too bad)

daily_energy (overall emotion score) = 8 * joy + 2 * neutral - 2.5 * sadness - 2.5 * fear - 2.5 * anger - 2.5 * disgust

if the neutral score is over 0.6 out of 1, daily_enery will be set to 0

## Scheduling Algorithm
We will follow the principle of prioritization as the line below:
Deadlines > User Availability > Personality > Emotion

PS: I assumed personality scores range between 1-5

### Weekly Study Load Calculation
* available_days_of_week (monday, tuesday, ...) (user will enter this)
* total_estimated_effort (sum of total_effort for each task in the week)
* daily_study_load = (total_estimated_effort / len(available_days_of_week))

### Daily Study Load Calculation
* available_hours_of_day (e.g., 17-23) (user will enter this)
* daily_study_load (this will be gathered from the weekly study load calculation's last parameter)
* daily_session_num (how many study sessions will be for a day) = round(conscientiousness_score + 0.3 * daily_energy)
* focus_duration_per_session = round(conscientiousness - neuroticism + 0.3 * daily_energy) * 10
* break_duration_per_session (subtract daily total workload from available hours of that day and divide to daily study session number) =
     ((len(available_hours_of_day) - focus_duration_per_session * daily_session_num) / (daily_session_num - 1))
* subject_variation = rounded openness score (if the openness score is 3.43, it will be round down to 3) (this decides how many different subjects the user will study in a day)
* motivation_frequency = 5 * round(agreeableness / conscientiousness) (agreeableness affects positively, conscientiousness affects negatively)
* suggest_study_group (boolean true if extraversion is 3 or higher)
