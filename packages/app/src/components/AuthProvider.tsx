import { Center, Spinner } from "@chakra-ui/react";
import { type ReactNode, useEffect, useState } from "react";
import { fetchAuthCheck } from "../api/services";
import { LoginPage } from "../pages/Login/LoginPage";

interface IAuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: IAuthProviderProps) {
	const [isAuthenticated, setIsAuthenticated] = useState(true);
	const [isChecking, setIsChecking] = useState(true);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		async function check() {
			const result = await fetchAuthCheck();
			if (!result.ok) {
				timer = setTimeout(check, 1000);
				return;
			}
			setIsAuthenticated(result.ok && !!result.data);
			setIsChecking(false);
		}
		check();
		return () => { if (timer) clearTimeout(timer); };
	}, []);

	if (isChecking) {
		return (
			<Center h="100vh" w="100vw">
				<Spinner size="xl" color="brand.500" />
			</Center>
		);
	}

	if (!isAuthenticated) {
		return <LoginPage />;
	}

	return <>{children}</>;
}
