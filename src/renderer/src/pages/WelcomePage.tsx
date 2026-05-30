import { Center, Stack, Title, Text } from '@mantine/core'

export default function WelcomePage() {
  return (
    <Center h="100vh">
      <Stack align="center" gap="md">
        <img src="/logo.svg" alt="DB Warden" width={96} height={96} />
        <Title order={2} c="dimmed">DB Warden</Title>
        <Text c="dimmed" ta="center" maw={380}>
          Add a database connection from the sidebar to manage users, roles and privileges.
          Your credentials are encrypted and stored locally — nothing leaves your machine.
        </Text>
      </Stack>
    </Center>
  )
}
