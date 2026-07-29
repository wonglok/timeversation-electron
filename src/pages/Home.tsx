import { Link } from "react-router-dom";

export function Home() {
    return (
        <>
            Home
            <Link to={"/setup"}>Setup</Link>
        </>
    );
}
