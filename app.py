import os
from datetime import date, datetime

from cs50 import SQL
from flask import Flask, flash, redirect, render_template, request, session
from flask_session import Session
from werkzeug.security import check_password_hash, generate_password_hash

from helpers import apology, lbs, login_required, pretty_date

# Configure application
app = Flask(__name__)

# Custom Jinja filters
app.jinja_env.filters["lbs"] = lbs
app.jinja_env.filters["pretty_date"] = pretty_date

# Configure session to use filesystem (instead of signed cookies)
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
Session(app)

# Exercises every user can pick from the dropdown
PRESET_EXERCISES = [
    "Barbell Row",
    "Bench Press",
    "Deadlift",
    "Dumbbell Curl",
    "Lat Pulldown",
    "Leg Press",
    "Overhead Press",
    "Pull-Up",
    "Romanian Deadlift",
    "Squat",
]

# The CS50 SQL library needs the database file to exist before connecting
DB_PATH = "workout.db"
if not os.path.exists(DB_PATH):
    open(DB_PATH, "w").close()
db = SQL(f"sqlite:///{DB_PATH}")


def init_db():
    """Create tables if they don't exist and add the preset exercises once."""
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            hash TEXT NOT NULL
        )
    """)
    # user_id is NULL for presets, or the owner's id for custom exercises
    db.execute("""
        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            name TEXT NOT NULL,
            user_id INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            user_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            sets INTEGER NOT NULL,
            reps INTEGER NOT NULL,
            weight REAL NOT NULL,
            notes TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(exercise_id) REFERENCES exercises(id)
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts (user_id, date)")

    presets = db.execute("SELECT COUNT(*) AS n FROM exercises WHERE user_id IS NULL")
    if presets[0]["n"] == 0:
        for name in PRESET_EXERCISES:
            db.execute("INSERT INTO exercises (name, user_id) VALUES (?, NULL)", name)


init_db()


def available_exercises(user_id):
    """Return presets plus the user's own custom exercises, sorted by name."""
    return db.execute(
        "SELECT id, name, user_id FROM exercises WHERE user_id IS NULL OR user_id = ? ORDER BY name",
        user_id
    )


@app.after_request
def after_request(response):
    """Ensure responses aren't cached"""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Expires"] = 0
    response.headers["Pragma"] = "no-cache"
    return response


@app.route("/")
@login_required
def index():
    """Dashboard: totals, personal records, and recent entries"""
    user_id = session["user_id"]

    totals = db.execute(
        """
        SELECT COUNT(*) AS entries,
               COUNT(DISTINCT date) AS days,
               COALESCE(SUM(sets * reps * weight), 0) AS volume
        FROM workouts WHERE user_id = ?
        """,
        user_id
    )[0]

    # In SQLite, the bare column w.date comes from the row holding MAX(weight),
    # so this gives the date each record was set.
    records = db.execute(
        """
        SELECT e.name, MAX(w.weight) AS best, w.date
        FROM workouts w JOIN exercises e ON w.exercise_id = e.id
        WHERE w.user_id = ?
        GROUP BY e.id
        ORDER BY best DESC
        """,
        user_id
    )

    recent = db.execute(
        """
        SELECT w.date, e.name, w.sets, w.reps, w.weight
        FROM workouts w JOIN exercises e ON w.exercise_id = e.id
        WHERE w.user_id = ?
        ORDER BY w.date DESC, w.id DESC
        LIMIT 5
        """,
        user_id
    )

    username = db.execute("SELECT username FROM users WHERE id = ?", user_id)[0]["username"]

    return render_template(
        "index.html", totals=totals, records=records, recent=recent, username=username
    )


@app.route("/log", methods=["GET", "POST"])
@login_required
def log():
    """Log one exercise entry"""
    user_id = session["user_id"]

    if request.method == "POST":
        choice = request.form.get("exercise")
        new_name = (request.form.get("new_exercise") or "").strip()
        date_input = request.form.get("date")
        notes = (request.form.get("notes") or "").strip()

        # Work out which exercise this entry is for
        if not choice:
            return apology("Choose an exercise.", 400)

        if choice == "new":
            if not new_name:
                return apology("Type a name for your new exercise.", 400)
            if len(new_name) > 50:
                return apology("Exercise names can be up to 50 characters.", 400)

            # Reuse an existing exercise if the name matches, ignoring case
            existing = db.execute(
                "SELECT id FROM exercises WHERE LOWER(name) = LOWER(?) AND (user_id IS NULL OR user_id = ?)",
                new_name, user_id
            )
            if existing:
                exercise_id = existing[0]["id"]
            else:
                exercise_id = db.execute(
                    "INSERT INTO exercises (name, user_id) VALUES (?, ?)", new_name, user_id
                )
        else:
            try:
                exercise_id = int(choice)
            except ValueError:
                return apology("That exercise doesn't exist.", 400)
            allowed = db.execute(
                "SELECT id FROM exercises WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
                exercise_id, user_id
            )
            if not allowed:
                return apology("That exercise doesn't exist.", 400)

        # Validate the date
        try:
            entry_date = datetime.strptime(date_input or "", "%Y-%m-%d").date()
        except ValueError:
            return apology("Enter a valid date.", 400)
        if entry_date > date.today():
            return apology("The date can't be in the future.", 400)

        # Validate the numbers
        try:
            sets = int(request.form.get("sets"))
            reps = int(request.form.get("reps"))
            weight = float(request.form.get("weight"))
        except (TypeError, ValueError):
            return apology("Sets and reps must be whole numbers, and weight must be a number.", 400)

        if not 1 <= sets <= 100:
            return apology("Sets must be between 1 and 100.", 400)
        if not 1 <= reps <= 1000:
            return apology("Reps must be between 1 and 1000.", 400)
        if not 0 <= weight <= 2000:
            return apology("Weight must be between 0 and 2000 lb.", 400)
        if len(notes) > 200:
            return apology("Notes can be up to 200 characters.", 400)

        db.execute(
            """
            INSERT INTO workouts (user_id, exercise_id, date, sets, reps, weight, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            user_id, exercise_id, entry_date.isoformat(), sets, reps, weight, notes or None
        )

        flash("Entry saved.")
        return redirect("/")

    return render_template(
        "log.html",
        exercises=available_exercises(user_id),
        today=date.today().isoformat()
    )


@app.route("/history")
@login_required
def history():
    """Show every logged entry, newest first"""
    entries = db.execute(
        """
        SELECT w.id, w.date, e.name, w.sets, w.reps, w.weight, w.notes
        FROM workouts w JOIN exercises e ON w.exercise_id = e.id
        WHERE w.user_id = ?
        ORDER BY w.date DESC, w.id DESC
        """,
        session["user_id"]
    )
    return render_template("history.html", entries=entries)


@app.route("/delete", methods=["POST"])
@login_required
def delete():
    """Delete one of the user's own entries"""
    try:
        entry_id = int(request.form.get("id"))
    except (TypeError, ValueError):
        return apology("That entry doesn't exist.", 400)

    # Matching on user_id too means users can only delete their own entries
    deleted = db.execute(
        "DELETE FROM workouts WHERE id = ? AND user_id = ?", entry_id, session["user_id"]
    )
    if deleted == 0:
        return apology("That entry doesn't exist.", 400)

    flash("Entry deleted.")
    return redirect("/history")


@app.route("/progress")
@login_required
def progress():
    """Chart the heaviest weight per day for one exercise"""
    user_id = session["user_id"]

    # Only offer exercises the user has actually logged
    logged = db.execute(
        """
        SELECT DISTINCT e.id, e.name
        FROM workouts w JOIN exercises e ON w.exercise_id = e.id
        WHERE w.user_id = ?
        ORDER BY e.name
        """,
        user_id
    )

    if not logged:
        return render_template("progress.html", logged=[], selected=None, labels=[], values=[])

    # Use the exercise from the URL if valid, otherwise the first one
    selected = logged[0]
    requested = request.args.get("exercise_id")
    for exercise in logged:
        if str(exercise["id"]) == requested:
            selected = exercise
            break

    points = db.execute(
        """
        SELECT date, MAX(weight) AS top
        FROM workouts
        WHERE user_id = ? AND exercise_id = ?
        GROUP BY date
        ORDER BY date
        """,
        user_id, selected["id"]
    )

    labels = [pretty_date(p["date"]) for p in points]
    values = [p["top"] for p in points]
    gain = values[-1] - values[0] if len(values) > 1 else 0

    return render_template(
        "progress.html",
        logged=logged,
        selected=selected,
        labels=labels,
        values=values,
        best=max(values),
        gain=gain
    )


@app.route("/login", methods=["GET", "POST"])
def login():
    """Log user in"""
    session.clear()

    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        if not username:
            return apology("Enter your username.", 403)
        if not password:
            return apology("Enter your password.", 403)

        rows = db.execute("SELECT * FROM users WHERE username = ?", username)
        if len(rows) != 1 or not check_password_hash(rows[0]["hash"], password):
            return apology("That username and password don't match.", 403)

        session["user_id"] = rows[0]["id"]
        return redirect("/")

    return render_template("login.html")


@app.route("/logout")
def logout():
    """Log user out"""
    session.clear()
    return redirect("/")


@app.route("/register", methods=["GET", "POST"])
def register():
    """Register user"""
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password")
        confirmation = request.form.get("confirmation")

        if not username:
            return apology("Choose a username.", 400)
        if len(username) > 30:
            return apology("Usernames can be up to 30 characters.", 400)
        if not password:
            return apology("Choose a password.", 400)
        if len(password) < 8:
            return apology("Passwords need at least 8 characters.", 400)
        if password != confirmation:
            return apology("The passwords don't match.", 400)

        try:
            user_id = db.execute(
                "INSERT INTO users (username, hash) VALUES (?, ?)",
                username, generate_password_hash(password)
            )
        except ValueError:
            return apology("That username is taken.", 400)

        session["user_id"] = user_id
        flash("Welcome! Log your first lift to get started.")
        return redirect("/")

    return render_template("register.html")
