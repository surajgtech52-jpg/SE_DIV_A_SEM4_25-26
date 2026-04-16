export const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
    const baseStyle = "uppercase font-bold text-sm px-4 py-2 transition-colors duration-200 border border-black rounded-none focus:outline-none";
    const variants = {
        primary: "bg-black text-white hover:bg-gray-800",
        secondary: "bg-white text-black hover:bg-gray-100",
        danger: "bg-white text-black border-black hover:bg-gray-100" // No red, strictly monochrome
    };

    return (
        <button
            onClick={onClick}
            className={`${baseStyle} ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};

export const Input = ({ label, error, className = '', ...props }) => (
    <div className={`mb-4 ${className}`}>
        {label && <label className="block text-sm font-bold uppercase mb-1">{label}</label>}
        <input
            className={`w-full p-2 border ${error ? 'border-black border-2' : 'border-gray-400'} focus:border-black focus:outline-none rounded-none transition-colors`}
            {...props}
        />
        {error && <p className="text-xs font-bold mt-1 uppercase">Error: {error}</p>}
    </div>
);

export const Table = ({ headers, data, renderRow, className = '' }) => (
    <div className={`overflow-x-auto border border-black ${className}`}>
        <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 border-b border-black text-black">
                <tr>
                    {headers.map((h, i) => (
                        <th key={i} className="p-3 font-bold uppercase tracking-wider border-r border-gray-300 last:border-r-0">{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
                {data.length > 0 ? (
                    data.map((item, i) => renderRow(item, i))
                ) : (
                    <tr>
                        <td colSpan={headers.length} className="p-4 text-center text-gray-500 italic">No data available</td>
                    </tr>
                )}
            </tbody>
        </table>
    </div>
);

export const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-white/80 backdrop-grayscale z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black w-full max-w-lg shadow-none">
                <div className="flex justify-between items-center border-b border-gray-200 p-4 bg-gray-50">
                    <h2 className="text-lg font-bold uppercase">{title}</h2>
                    <button onClick={onClose} className="text-xl font-bold hover:text-gray-600">&times;</button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};
