import i18nextSingleton from "i18next";
import { Box, Flex, Link, Text, VStack } from "@chakra-ui/react";
import { Github } from "lucide-react";
import { Card } from "../../components/Card";
import { PageHeader } from "../../components/PageHeader";
import { openExternal } from "../../utils/openExternal";

export function AboutPage() {
	return (
		<Box>
			<PageHeader title="warpdrv" icon={<Github size={20} />} />
			<Box
				pt="76px"
				px="4"
				pb="4"
				display="flex"
				justifyContent="center"
				alignItems="center"
				minH="calc(100vh - 100px)"
				overflow="auto"
			>
				<VStack align="center" gap="6" w="full" maxW="480px">
					{/* Logo */}
					<Box textAlign="center" py="4">
						<img src="/logo.png" alt="WarpDrv" width="160" />
					</Box>

					{/* Attribution */}
					<Card>
						<VStack gap="3" align="center">
							<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">

								{i18nextSingleton.t("about:website")}
							</Text>
							<VStack gap="1.5" alignItems="center">
								<Text fontSize="13px" color="var(--wc-text-secondary)">

									{i18nextSingleton.t("about:builtWith")}{" "}
									<Text as="span" color="var(--wc-accent-red)">
										❤
									</Text>{" "}

									{i18nextSingleton.t("common:ui.byNbsp")}
									<Link
										href="https://www.github.com/mikjee"
										color="var(--wc-accent-blue)"
										_hover={{
											color: "var(--wc-accent-blue-hover)",
											textDecoration: "underline",
											cursor: "pointer",
										}}
										onClick={(e) => {
											e.preventDefault();
											openExternal("https://www.github.com/mikjee");
										}}
									>
										<Text fontSize="13px" fontWeight="500">
											@mikjee
										</Text>
									</Link>
								</Text>
								<Text fontSize="13px" color="var(--wc-text-secondary)">
									<Link
										href="https://warpdrv.ai"
										color="var(--wc-accent-blue)"
										_hover={{
											color: "var(--wc-accent-blue-hover)",
											textDecoration: "underline",
											cursor: "pointer",
										}}
										onClick={(e) => {
											e.preventDefault();
											openExternal("https://warpdrv.ai");
										}}
									>
										<Text fontSize="13px" fontWeight="500">

											{i18nextSingleton.t("about:visitWebsite")}
										</Text>
									</Link>
								</Text>
							</VStack>
						</VStack>
					</Card>

					{/* Copyright */}
					<Card>
						<VStack gap="3" align="center">
							<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">

								{i18nextSingleton.t("about:copyright")}
							</Text>
							<Text fontSize="12px" color="var(--wc-text-tertiary)">

								{i18nextSingleton.t("about:copyrightText")}
							</Text>
						</VStack>
					</Card>

					{/* Legal Links */}
					<Card>
						<VStack gap="3" align="center">
							<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">

								{i18nextSingleton.t("about:legal")}
							</Text>
							<Flex gap="4" flexWrap="wrap" justifyContent="center">
								<Link
									href="https://raw.githubusercontent.com/mikjee/warpdrv/master/LICENSE"
									color="var(--wc-accent-blue)"
									_hover={{
										color: "var(--wc-accent-blue-hover)",
										textDecoration: "underline",
									}}
									fontSize="12px"
									onClick={(e) => {
										e.preventDefault();
										openExternal(
											"https://raw.githubusercontent.com/mikjee/warpdrv/master/LICENSE",
										);
									}}
								>

									{i18nextSingleton.t("about:licenseAgreement")}
								</Link>
							</Flex>
						</VStack>
					</Card>

					{/* Footer */}
					<Text fontSize="11px" color="var(--wc-text-muted)" textAlign="center" mt="2">

						{i18nextSingleton.t("about:becomeSponsor")}
					</Text>
				</VStack>
			</Box>
		</Box>
	);
}
