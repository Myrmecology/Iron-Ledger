# Iron Ledger
#### Video Demo: https://www.youtube.com/watch?v=L6l5MI_29v8
#### Description:

Iron Ledger is a web application for logging strength training workouts and tracking progress over time. Users create an account, record each exercise they perform along with the sets, reps, and weight, and the app turns those entries into personal records, training totals, and a progress chart for each lift. It is built for anyone who lifts weights and wants a simple, focused place to see whether they are getting stronger. I chose to build this application because I have a passion for working out and keeping track of my progress.

The app is written in Python using the Flask framework, with a SQLite database, HTML templates rendered with Jinja, custom CSS, and a small amount of JavaScript. It follows the same overall structure as the CS50 Finance problem set, which gave me a solid foundation for user accounts, sessions, and database queries.

## Features

After registering and logging in, the user lands on a dashboard. The dashboard shows three totals: the number of training days, the number of entries logged, and the total pounds lifted, which is calculated as sets times reps times weight across every entry. Below that is the record board, which lists the heaviest weight the user has lifted for each exercise and the date that record was set. The dashboard also shows the five most recent entries.

The Log page is where entries are added. The user picks an exercise from a dropdown of ten preset lifts, such as Bench Press, Squat, and Deadlift, or chooses "Add a new exercise" to type in their own. They then enter the date, sets, reps, weight in pounds, and an optional note. The History page lists every entry, newest first, and lets the user delete mistakes. The Progress page lets the user choose any exercise they have logged and draws a line chart of their heaviest weight on each training day, along with their best lift and how much they have gained since their first entry.

## Files

`app.py` contains the Flask application and all of its routes. The `/` route builds the dashboard. `/log` displays the entry form and, when submitted, validates the input and saves it. `/history` lists all entries, and `/delete` removes one, but only if it belongs to the logged-in user. `/progress` gathers the data for the chart. `/register`, `/login`, and `/logout` handle accounts, with passwords stored as hashes rather than plain text. The file also contains `init_db()`, which creates the database tables and adds the preset exercises the first time the app runs.

`helpers.py` holds supporting functions. `login_required` is a decorator that redirects visitors to the login page if they are not signed in. `apology` renders an error page with a message and the correct HTTP status code. Two custom Jinja filters handle display: `lbs` formats weights, so 225.0 shows as "225 lb" and 0 shows as "Bodyweight", and `pretty_date` turns a date like 2026-09-30 into "Sep 30, 2026".

The `templates` folder contains the HTML pages. `layout.html` is the shared layout with the navigation bar, and the other pages (index, log, history, progress, login, register, and apology) extend it. `log.html` includes a short script that shows the "new exercise" text box only when that option is selected, and `progress.html` uses the Chart.js library to draw the chart. `static/styles.css` contains all of the styling.

## Database

The database has three tables. `users` stores each username and password hash. `exercises` stores exercise names, and `workouts` stores every logged entry, linked to both a user and an exercise.

The most interesting part of the design is how preset and custom exercises share the `exercises` table. Preset exercises have a `user_id` of NULL, which means every user can see them. Custom exercises store the id of the user who created them, so they only appear in that user's dropdown. When a user adds a custom exercise whose name already exists, ignoring capitalization, the app reuses the existing exercise instead of creating a duplicate.

## Design Choices

I chose pounds as the only unit to keep the app simple, since that is the unit I train in. I chose a dropdown of preset exercises combined with the option to add your own because free typing leads to spelling variations, like "bench" and "Bench Press", that would split one lift into two records. A weight of 0 is treated as bodyweight so that exercises like pull-ups can still be logged. The database creates itself on startup, so the app can run without any manual setup.

For the visual design, I wanted something elegant that fits the subject. The colors come from a gym: a chalk-white background, a dark iron header, and accents taken from the colors of competition weight plates. The record board is styled like the records board on a gym wall, with each personal record marked by a red, blue, yellow, or green plate-colored stripe.

## Final Thoughts

I would like to thank Harvard University for an excellent class. 

# FOR A VIDEO DEMO PLEASE CHECK OUT: https://www.youtube.com/watch?v=L6l5MI_29v8
