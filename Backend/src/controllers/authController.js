const signup = async (req, res) => {
    try {
        // req.body contains the data sent from the frontend (like email, password)
        const { name, email, password, role } = req.body;

        // TODO: Later, we will write the SQL query here to insert the user into the database

        res.status(201).json({ message: "User signed up successfully", email, role });
    } catch (error) {
        res.status(500).json({ error: "Something went wrong during signup" });

    }
};

const login = async (req, res) => {
    try {

        //req.body contains the data sent from the frontend (like email, password)
        const { email, password } = req.body;

        // TODO: Later, we will write the SQL query here to check the user and login the user

        res.status(200).json({ message: "User logged in successfully", email });
    } catch (error) {
        res.status(500).json({ error: "Something went wrong ducing login" });
    }
}

module.exports = {
    signup,
    login
};