import logo from "../../assets/logo1.svg";

const FormComponent = () => {
  const joinRoom = () => {
    // Logic to join a room
    console.log("Joining room...");
  };
  return (
    <div className="flex w-full max-w-[500px] flex-col items-center justify-center gap-4 p-4 sm:w-[500px] sm:p-8">
      <img src={logo} alt="Code World Logo" className="w-full" />
      <form onSubmit={joinRoom} className="flex w-full flex-col gap-4">
        <input
          type="text"
          placeholder="Enter your name"
          className="w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <input
          type="text"
          placeholder="Enter room code"
          className="w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 p-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Join Room
        </button>
      </form>
    </div>
  );
};

export default FormComponent;
