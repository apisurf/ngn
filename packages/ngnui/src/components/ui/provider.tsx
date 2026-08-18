"use client";

import {
  ChakraProvider,
  type SystemContext,
  defaultSystem,
} from "@chakra-ui/react";
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode";

export function Provider(
  props: ColorModeProviderProps & { system?: SystemContext } = {},
) {
  return (
    <ChakraProvider value={props.system ?? defaultSystem}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  );
}
