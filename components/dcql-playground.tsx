"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { DcqlQuery } from "dcql"
import { Editor } from "@monaco-editor/react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Sun, Moon, Check, ChevronsUpDown, Eye, Code, CheckCircle, XCircle, Trash2, Plus, Settings } from "lucide-react"
import { useTheme } from "next-themes"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { Label } from "./ui/label"
import { Switch } from "./ui/switch"

/* ------------------------------------------------------------------ */
/*  SAMPLE DATA                                                       */
/* ------------------------------------------------------------------ */
const SAMPLE_QUERIES = [
  {
    name: "Basic mVRC Query (mDOC)",
    query: {
      id: "mvrc_credential",
      format: "mso_mdoc" as const,
      meta: { doctype_value: "org.iso.7367.1.mVRC" },
      require_cryptographic_holder_binding: true,
      claims: [
        { path: ["org.iso.7367.1", "vehicle_holder"], intent_to_retain: false },
        { path: ["org.iso.18013.5.1", "first_name"], intent_to_retain: true },
      ],
      trusted_authorities: [
        {
          type: "aki",
          values: ["one", "two"],
        },
      ],
    },
  },
  {
    name: "Driver License Query (mDOC)",
    query: {
      id: "dl_credential",
      format: "mso_mdoc" as const,
      meta: { doctype_value: "org.iso.18013.5.1.mDL" },
      claims: [
        { path: ["org.iso.18013.5.1", "family_name"], intent_to_retain: true },
        { path: ["org.iso.18013.5.1", "driving_privileges"], intent_to_retain: false },
      ],
      trusted_authorities: [
        {
          type: "openid_federation",
          values: ["https://federation.com"],
        },
      ],
    },
  },
  {
    name: "Identity Credential Query (SD-JWT VC)",
    query: {
      id: "identity_credential",
      format: "vc+sd-jwt" as const,
      meta: {
        vct_values: ["https://credentials.example.com/identity_credential"],
      },
      claims: [
        { path: ["last_name"], intent_to_retain: true },
        { path: ["first_name"], intent_to_retain: true },
        { path: ["address", "street_address"], intent_to_retain: false },
      ],
      require_cryptographic_holder_binding: true,
    },
  },
  {
    name: "University Degree Query (W3C)",
    query: {
      id: "degree_credential",
      format: "ldp_vc" as const,
      meta: {
        type_values: [
          ["https://example.org/examples#AlumniCredential", "https://example.org/examples#BachelorDegree"],
          [
            "https://www.w3.org/2018/credentials#VerifiableCredential",
            "https://example.org/examples#UniversityDegreeCredential",
          ],
        ],
      },
      claims: [
        { path: ["last_name"], intent_to_retain: true },
        { path: ["first_name"], intent_to_retain: true },
        { path: ["address", "street_address"], intent_to_retain: false },
      ],
      require_cryptographic_holder_binding: true,
    },
  },
]

const SAMPLE_CREDENTIALS = [
  {
    name: "Vehicle Registration (mVRC)",
    credential: {
      credential_format: "mso_mdoc",
      doctype: "org.iso.7367.1.mVRC",
      namespaces: {
        "org.iso.7367.1": {
          vehicle_holder: "Martin Auer",
          non_disclosed: "secret",
        },
        "org.iso.18013.5.1": { first_name: "Martin Auer" },
      },
      authority: {
        type: "aki",
        value: "one",
      },
      cryptographic_holder_binding: true,
    },
  },
  {
    name: "Driver License (mDL)",
    credential: {
      credential_format: "mso_mdoc",
      doctype: "org.iso.18013.5.1.mDL",
      namespaces: {
        "org.iso.18013.5.1": {
          given_name: "Jake",
          family_name: "Jakeson",
          driving_privileges: [
            {
              code: "B",
            },
            {
              code: "A",
            },
          ],
        },
      },
      authority: {
        type: "openid_federation",
        value: "https://federation.com",
      },
      cryptographic_holder_binding: true,
    },
  },
  {
    name: "Identity Credential (SD-JWT VC)",
    credential: {
      credential_format: "vc+sd-jwt",
      vct: "https://credentials.example.com/identity_credential",
      claims: {
        first_name: "Arthur",
        last_name: "Dent",
        address: {
          street_address: "42 Market Street",
          locality: "Milliways",
          postal_code: "12345",
        },
        degrees: [
          {
            type: "Bachelor of Science",
            university: "University of Betelgeuse",
          },
          {
            type: "Master of Science",
            university: "University of Betelgeuse",
          },
        ],
        nationalities: ["British", "Betelgeusian"],
      },
      cryptographic_holder_binding: true,
    },
  },
  {
    name: "University Degree (W3C VC)",
    credential: {
      credential_format: "ldp_vc",
      type: [
        "https://www.w3.org/2018/credentials#VerifiableCredential",
        "https://example.org/examples#AlumniCredential",
        "https://example.org/examples#BachelorDegree",
      ],
      claims: {
        first_name: "Arthur",
        last_name: "Dent",
        address: {
          street_address: "42 Market Street",
          locality: "Milliways",
          postal_code: "12345",
        },
        degrees: [
          {
            type: "Bachelor of Science",
            university: "University of Betelgeuse",
          },
          {
            type: "Master of Science",
            university: "University of Betelgeuse",
          },
        ],
        nationalities: ["British", "Betelgeusian"],
      },
      cryptographic_holder_binding: true,
    },
  },
]

/* ------------------------------------------------------------------ */
/*  TYPES                                                             */
/* ------------------------------------------------------------------ */
interface CredentialSet {
  options: string[][]
  required: boolean
}

/* ------------------------------------------------------------------ */
/*  SMALL UTILS                                                       */
/* ------------------------------------------------------------------ */
function useDebounce<T extends (...a: any) => any>(fn: T, delay = 800) {
  const timer = useRef<NodeJS.Timeout | null>(null)
  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => fn(...args), delay)
    },
    [fn, delay],
  )
}


/* ------------------------------------------------------------------ */
/*  CREDENTIAL SET BUILDER COMPONENTS                                 */
/* ------------------------------------------------------------------ */
interface CredentialSetBuilderProps {
  credentialSets: CredentialSet[]
  onCredentialSetsChange: (sets: CredentialSet[]) => void
  availableCredentialIds: string[]
}

function CredentialSetBuilder({
  credentialSets,
  onCredentialSetsChange,
  availableCredentialIds,
}: CredentialSetBuilderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingSets, setEditingSets] = useState<CredentialSet[]>(credentialSets)

  useEffect(() => {
    setEditingSets(credentialSets)
  }, [credentialSets])

  const handleSave = () => {
    onCredentialSetsChange(editingSets)
    setIsOpen(false)
  }

  const addCredentialSet = () => {
    setEditingSets([...editingSets, { options: [[]], required: true }])
  }

  const removeCredentialSet = (setIndex: number) => {
    setEditingSets(editingSets.filter((_, index) => index !== setIndex))
  }

  const updateCredentialSet = (setIndex: number, updates: Partial<CredentialSet>) => {
    setEditingSets(editingSets.map((set, index) => (index === setIndex ? { ...set, ...updates } : set)))
  }

  const addOption = (setIndex: number) => {
    const newSets = [...editingSets]
    newSets[setIndex].options.push([])
    setEditingSets(newSets)
  }

  const removeOption = (setIndex: number, optionIndex: number) => {
    const newSets = [...editingSets]
    newSets[setIndex].options = newSets[setIndex].options.filter((_, index) => index !== optionIndex)
    setEditingSets(newSets)
  }

  const updateOption = (setIndex: number, optionIndex: number, credentialIds: string[]) => {
    const newSets = [...editingSets]
    newSets[setIndex].options[optionIndex] = credentialIds
    setEditingSets(newSets)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 bg-transparent">
          <Settings className="h-3 w-3 mr-1" />
          Credential Sets
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Credential Sets</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {editingSets.map((credentialSet, setIndex) => (
            <Card key={setIndex} className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Credential Set {setIndex + 1}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`required-${setIndex}`}
                        checked={credentialSet.required}
                        onCheckedChange={(checked) => updateCredentialSet(setIndex, { required: checked })}
                      />
                      <Label htmlFor={`required-${setIndex}`} className="text-xs">
                        Required
                      </Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCredentialSet(setIndex)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {credentialSet.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Option {optionIndex + 1}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(setIndex, optionIndex)}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <CredentialIdMultiSelect
                      selectedIds={option}
                      availableIds={availableCredentialIds}
                      onSelectionChange={(ids) => updateOption(setIndex, optionIndex, ids)}
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addOption(setIndex)} className="w-full">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Option
                </Button>
              </CardContent>
            </Card>
          ))}

          <div className="flex gap-2">
            <Button variant="outline" onClick={addCredentialSet} className="flex-1 bg-transparent">
              <Plus className="h-4 w-4 mr-2" />
              Add Credential Set
            </Button>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button onClick={handleSave} className="flex-1">
              Apply Changes
            </Button>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface CredentialIdMultiSelectProps {
  selectedIds: string[]
  availableIds: string[]
  onSelectionChange: (ids: string[]) => void
}

function CredentialIdMultiSelect({ selectedIds, availableIds, onSelectionChange }: CredentialIdMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          className="w-full justify-between h-auto min-h-8 text-xs bg-transparent"
        >
          <div className="flex flex-wrap gap-1">
            {selectedIds.length === 0 ? (
              <span className="text-muted-foreground">Select credential IDs...</span>
            ) : (
              selectedIds.map((id) => (
                <Badge key={id} variant="outline" className="text-xs">
                  {id}
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search credential IDs..." className="h-9" />
          <CommandList>
            <CommandEmpty>No credential IDs found.</CommandEmpty>
            <CommandGroup>
              {availableIds.map((id) => (
                <CommandItem key={id} value={id} onSelect={() => handleToggle(id)}>
                  <Check className={`mr-2 h-4 w-4 ${selectedIds.includes(id) ? "opacity-100" : "opacity-0"}`} />
                  <span className="text-xs">{id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ */
/*  VISUALIZATION COMPONENTS                                          */
/* ------------------------------------------------------------------ */
interface VisualizationProps {
  data: any
}

function ResultsVisualization({ data }: VisualizationProps) {
  if (!data || typeof data !== "object") {
    return <div className="p-4 text-muted-foreground">No results to display</div>
  }

  const canBeSatisfied = data.can_be_satisfied
  const credentialMatches = data.credential_matches || {}

  return (
    <div className="p-4 space-y-4">
      {/* Overall Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {canBeSatisfied ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            Overall Query Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant={canBeSatisfied ? "default" : "destructive"}>
            {canBeSatisfied ? "Can be satisfied" : "Cannot be satisfied"}
          </Badge>
        </CardContent>
      </Card>

      {/* Credential Sets */}
      {data.credential_sets && data.credential_sets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-5 w-5 text-blue-500" />
              Credential Sets ({data.credential_sets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.credential_sets.map((credentialSet: any, index: number) => (
                <CredentialSetCard
                  key={index}
                  credentialSet={credentialSet}
                  setIndex={index}
                  credentialMatches={credentialMatches}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credential Matches */}
      <div className="space-y-3">
        {Object.entries(credentialMatches).map(([queryId, match]: [string, any]) => (
          <CredentialMatchCard key={queryId} queryId={queryId} match={match} />
        ))}
      </div>
    </div>
  )
}

function CredentialMatchCard({ queryId, match }: { queryId: string; match: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const success = match.success
  const validCredentials = match.valid_credentials || []
  const failedCredentials = match.failed_credentials || []

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {success ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span>{queryId}</span>
                <Badge variant={success ? "default" : "destructive"} className="text-xs">
                  {success ? "Success" : "Failed"}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{validCredentials.length} valid</span>
                <span>{failedCredentials.length} failed</span>
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {/* Valid Credentials */}
              {validCredentials.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                    Valid Credentials ({validCredentials.length})
                  </h4>
                  <div className="space-y-2">
                    {validCredentials.map((cred: any, index: number) => (
                      <CredentialCard key={index} credential={cred} isValid={true} />
                    ))}
                  </div>
                </div>
              )}

              {/* Failed Credentials */}
              {failedCredentials.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                    Failed Credentials ({failedCredentials.length})
                  </h4>
                  <div className="space-y-2">
                    {failedCredentials.map((cred: any, index: number) => (
                      <CredentialCard key={index} credential={cred} isValid={false} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

function CredentialCard({ credential, isValid }: { credential: any; isValid: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const credentialIndex = credential.input_credential_index

  return (
    <Card className="border-l-4" style={{ borderLeftColor: isValid ? "#22c55e" : "#ef4444" }}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <CardTitle className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {isValid ? (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span>Credential {credentialIndex}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {SAMPLE_CREDENTIALS[credentialIndex]?.name || `Credential ${credentialIndex}`}
              </Badge>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {/* Meta */}
            <ValidationSection
              title="Meta"
              success={credential.meta?.success}
              issues={credential.meta?.issues}
              output={credential.meta?.output}
            />

            {/* Trusted Authorities */}
            <ValidationSection
              title="Trusted Authorities"
              success={credential.trusted_authorities?.success}
              issues={credential.trusted_authorities?.failed_trusted_authorities}
              output={credential.trusted_authorities?.valid_trusted_authority?.output}
            />

            {/* Claims */}
            <ValidationSection title="Claims" success={credential.claims?.success} claimsData={credential.claims} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

function ValidationSection({
  title,
  success,
  issues,
  output,
  claimsData,
}: { title: string; success?: boolean; issues?: any; output?: any; claimsData?: any }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border rounded-md">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              {success ? (
                <CheckCircle className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500" />
              )}
              <span className="text-xs font-medium">{title}</span>
            </div>
            <Badge variant={success ? "default" : "destructive"} className="text-xs">
              {success ? "Valid" : "Invalid"}
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3">
            {/* Handle Claims section specially */}
            {title === "Claims" && claimsData ? (
              <ClaimsDetailView claimsData={claimsData} />
            ) : (
              <>
                {/* Show output for successful validations */}
                {success && output && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-green-700 dark:text-green-400">Output:</h5>
                    <div className="bg-muted/50 rounded p-2">
                      <pre className="text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap overflow-auto">
                        {JSON.stringify(output, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Show issues for failed validations */}
                {!success && issues && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-muted-foreground">Issues:</h5>
                    {/* Handle trusted authorities array */}
                    {Array.isArray(issues)
                      ? issues.map((failedAuth: any, index: number) => (
                          <div key={index} className="border rounded p-2 space-y-2">
                            <div className="text-xs font-medium text-red-700 dark:text-red-400">
                              Trusted Authority {failedAuth.trusted_authority_index}:
                            </div>
                            {failedAuth.issues &&
                              Object.entries(failedAuth.issues).map(([key, messages]: [string, any]) => (
                                <div key={key} className="space-y-1 ml-2">
                                  <div className="text-xs font-medium text-red-600 dark:text-red-300">{key}:</div>
                                  {Array.isArray(messages) ? (
                                    messages.map((message: string, msgIndex: number) => (
                                      <div key={msgIndex} className="text-xs text-red-500 dark:text-red-400 ml-2">
                                        • {message}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-xs text-red-500 dark:text-red-400 ml-2">• {messages}</div>
                                  )}
                                </div>
                              ))}
                            {failedAuth.output && (
                              <div className="ml-2">
                                <div className="text-xs font-medium text-muted-foreground">Received:</div>
                                <div className="bg-muted/30 rounded p-1 mt-1">
                                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                                    {JSON.stringify(failedAuth.output, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      : /* Handle regular issues object */
                        issues &&
                        Object.keys(issues).length > 0 &&
                        Object.entries(issues).map(([key, messages]: [string, any]) => (
                          <div key={key} className="space-y-1">
                            <div className="text-xs font-medium text-red-700 dark:text-red-400">{key}:</div>
                            {Array.isArray(messages) ? (
                              messages.map((message: string, index: number) => (
                                <div key={index} className="text-xs text-red-600 dark:text-red-300 ml-2">
                                  • {message}
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-red-600 dark:text-red-300 ml-2">• {messages}</div>
                            )}
                          </div>
                        ))}
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function ClaimsDetailView({ claimsData }: { claimsData: any }) {
  const validClaims = claimsData.valid_claims || []
  const failedClaims = claimsData.failed_claims || []
  const validClaimSets = claimsData.valid_claim_sets || []
  const failedClaimSets = claimsData.failed_claim_sets || []

  return (
    <div className="space-y-4">
      {/* Individual Claims */}
      <div className="space-y-3">
        {/* Valid Claims */}
        {validClaims.length > 0 && (
          <div>
            <h5 className="text-xs font-medium text-green-700 dark:text-green-400 mb-2">
              Valid Claims ({validClaims.length})
            </h5>
            <div className="space-y-2">
              {validClaims.map((claim: any, index: number) => (
                <div
                  key={index}
                  className="border-l-2 border-green-500 pl-2 bg-green-50/50 dark:bg-green-950/20 rounded p-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-xs font-medium">
                      Claim {claim.claim_index}: {claim.claim_id || ""}
                    </span>
                  </div>
                  {claim.output && (
                    <div className="bg-muted/30 rounded p-1 mt-1">
                      <pre className="text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap">
                        {JSON.stringify(claim.output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Failed Claims */}
        {failedClaims.length > 0 && (
          <div>
            <h5 className="text-xs font-medium text-red-700 dark:text-red-400 mb-2">
              Failed Claims ({failedClaims.length})
            </h5>
            <div className="space-y-2">
              {failedClaims.map((claim: any, index: number) => (
                <div key={index} className="border-l-2 border-red-500 pl-2 bg-red-50/50 dark:bg-red-950/20 rounded p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span className="text-xs font-medium">
                      Claim {claim.claim_index}: {claim.claim_id || ""}
                    </span>
                  </div>
                  {claim.issues && (
                    <div className="space-y-1 mt-2">
                      {Object.entries(claim.issues).map(([key, messages]: [string, any]) => (
                        <div key={key} className="space-y-1">
                          <div className="text-xs font-medium text-red-600 dark:text-red-300">{key}:</div>
                          {Array.isArray(messages) ? (
                            messages.map((message: string, msgIndex: number) => (
                              <div key={msgIndex} className="text-xs text-red-500 dark:text-red-400 ml-2">
                                • {message}
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-red-500 dark:text-red-400 ml-2">• {messages}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {claim.output && Object.keys(claim.output).length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-muted-foreground">Received:</div>
                      <div className="bg-muted/30 rounded p-1 mt-1">
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {JSON.stringify(claim.output, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Claim Sets */}
      {(validClaimSets.length > 0 || failedClaimSets.length > 0) && (
        <div className="border-t pt-3 space-y-3">
          <h5 className="text-xs font-medium text-muted-foreground">Claim Sets</h5>

          {/* Valid Claim Sets */}
          {validClaimSets.length > 0 && (
            <div>
              <h6 className="text-xs font-medium text-green-700 dark:text-green-400 mb-2">
                Valid Claim Sets ({validClaimSets.length})
              </h6>
              <div className="space-y-2">
                {validClaimSets.map((claimSet: any, index: number) => (
                  <div
                    key={index}
                    className="border-l-2 border-green-500 pl-2 bg-green-50/30 dark:bg-green-950/10 rounded p-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium">
                        Claim Set {claimSet.claim_set_index !== undefined ? claimSet.claim_set_index : index}
                      </span>
                      {claimSet.valid_claim_indexes && (
                        <Badge variant="outline" className="text-xs">
                          Claim Indexes: {claimSet.valid_claim_indexes.join(", ")}
                        </Badge>
                      )}
                    </div>
                    {claimSet.output && (
                      <div className="bg-muted/30 rounded p-1 mt-1">
                        <pre className="text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap">
                          {JSON.stringify(claimSet.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Claim Sets */}
          {failedClaimSets.length > 0 && (
            <div>
              <h6 className="text-xs font-medium text-red-700 dark:text-red-400 mb-2">
                Failed Claim Sets ({failedClaimSets.length})
              </h6>
              <div className="space-y-2">
                {failedClaimSets.map((claimSet: any, index: number) => (
                  <div
                    key={index}
                    className="border-l-2 border-red-500 pl-2 bg-red-50/30 dark:bg-red-950/10 rounded p-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="h-3 w-3 text-red-500" />
                      <span className="text-xs font-medium">
                        Claim Set {claimSet.claim_set_index !== undefined ? claimSet.claim_set_index : index}
                      </span>
                      <div className="flex gap-1">
                        {claimSet.valid_claim_indexes && claimSet.valid_claim_indexes.length > 0 && (
                          <Badge variant="outline" className="text-xs text-green-600">
                            Valid Indexes: {claimSet.valid_claim_indexes.join(", ")}
                          </Badge>
                        )}
                        {claimSet.failed_claim_indexes && claimSet.failed_claim_indexes.length > 0 && (
                          <Badge variant="outline" className="text-xs text-red-600">
                            Failed Indexes: {claimSet.failed_claim_indexes.join(", ")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {claimSet.issues && (
                      <div className="space-y-1 mt-2">
                        {Object.entries(claimSet.issues).map(([key, messages]: [string, any]) => (
                          <div key={key} className="space-y-1">
                            <div className="text-xs font-medium text-red-600 dark:text-red-300">{key}:</div>
                            {Array.isArray(messages) ? (
                              messages.map((message: string, msgIndex: number) => (
                                <div key={msgIndex} className="text-xs text-red-500 dark:text-red-400 ml-2">
                                  • {message}
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-red-500 dark:text-red-400 ml-2">• {messages}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CredentialSetCard({
  credentialSet,
  setIndex,
  credentialMatches,
}: { credentialSet: any; setIndex: number; credentialMatches: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const isRequired = credentialSet.required
  const options = credentialSet.options || []
  const matchingOptions = credentialSet.matching_options || []
  const hasMatches = matchingOptions.length > 0

  // Get all available credential IDs from credential matches
  const availableCredentialIds = Object.keys(credentialMatches)

  return (
    <Card
      className="border-l-4"
      style={{ borderLeftColor: hasMatches ? "#22c55e" : isRequired ? "#ef4444" : "#f59e0b" }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {hasMatches ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : isRequired ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
                <span>Credential Set {setIndex}</span>
                <Badge variant={isRequired ? "default" : "secondary"} className="text-xs">
                  {isRequired ? "Required" : "Optional"}
                </Badge>
                <Badge variant={hasMatches ? "default" : "destructive"} className="text-xs">
                  {hasMatches ? `${matchingOptions.length} Matching` : "No Matches"}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Available Options */}
            <div className="space-y-2">
              {options.map((option: string[], optionIndex: number) => {
                const isMatching = matchingOptions.some(
                  (matchingOption: string[]) => JSON.stringify(matchingOption.sort()) === JSON.stringify(option.sort()),
                )

                return (
                  <div
                    key={optionIndex}
                    className={`border rounded-md p-3 ${
                      isMatching ? "border-green-500 bg-green-50/50 dark:bg-green-950/20" : "border-muted bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {isMatching ? (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="text-xs font-medium">
                        Option {optionIndex + 1} {isMatching && "(Matching)"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {option.map((credentialId: string, credIndex: number) => {
                        // Check if this specific credential ID has a successful match
                        const credentialHasMatch = credentialMatches[credentialId]?.success || false

                        return (
                          <Badge
                            key={credIndex}
                            variant="secondary"
                            className={`text-xs ${
                              credentialHasMatch
                                ? "border-green-200 text-green-800 bg-green-50 dark:border-green-800 dark:text-green-200 dark:bg-green-950/20"
                                : "border-red-200 text-red-800 bg-red-50 dark:border-red-800 dark:text-red-200 dark:bg-red-950/20"
                            }`}
                          >
                            {credentialHasMatch ? (
                              <CheckCircle className="h-2 w-2 mr-1 text-green-700 dark:text-green-300" />
                            ) : (
                              <XCircle className="h-2 w-2 mr-1 text-red-700 dark:text-red-300" />
                            )}
                            {credentialId}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* No Matches Message */}
            {matchingOptions.length === 0 && (
              <div className="text-center py-4">
                <XCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isRequired
                    ? "This required credential set has no matching options"
                    : "This optional credential set has no matching options"}
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                    */
/* ------------------------------------------------------------------ */
export function DCQLPlayground() {
  const { theme, setTheme } = useTheme()
  const [selectedQueryIndices, setSelectedQueryIndices] = useState<number[]>([0])
  const [selectedCredentialIndices, setSelectedCredentialIndices] = useState<number[]>([0, 1, 2, 3]) // All pre-selected
  const [credentialSets, setCredentialSets] = useState<CredentialSet[]>([])
  const [query, setQuery] = useState("")
  const [creds, setCreds] = useState("")
  const [result, setResult] = useState("[]")
  const [resultData, setResultData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [queryPopoverOpen, setQueryPopoverOpen] = useState(false)
  const [credentialPopoverOpen, setCredentialPopoverOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"code" | "visual">("visual")

  useEffect(() => setMounted(true), [])

    // Get available credential IDs from selected queries
  const availableCredentialIds = selectedQueryIndices.map((index) => SAMPLE_QUERIES[index].query.id)

  // Generate combined query from selected indices
  const generateCombinedQuery = useCallback((indices: number[], sets: CredentialSet[]) => {
    if (indices.length === 0) {
      return JSON.stringify({ credentials: [] }, null, 2)
    }

    const selectedCredentials = indices.map((index) => SAMPLE_QUERIES[index].query)
    const combinedQuery: any = {
      credentials: selectedCredentials,
    }

    // Add credential sets if any exist
    if (sets.length > 0) {
      combinedQuery.credential_sets = sets
    }

    return JSON.stringify(combinedQuery, null, 2)
  }, [])

  // Generate combined credentials from selected indices
  const generateCombinedCredentials = useCallback((indices: number[]) => {
    if (indices.length === 0) {
      return JSON.stringify([], null, 2)
    }

    const selectedCredentials = indices.map((index) => SAMPLE_CREDENTIALS[index].credential)
    return JSON.stringify(selectedCredentials, null, 2)
  }, [])

  // Update query when selection changes
  useEffect(() => {
    const newQuery = generateCombinedQuery(selectedQueryIndices, credentialSets)
    setQuery(newQuery)
  }, [selectedQueryIndices, credentialSets, generateCombinedQuery])

  // Update credentials when selection changes
  useEffect(() => {
    const newCredentials = generateCombinedCredentials(selectedCredentialIndices)
    setCreds(newCredentials)
  }, [selectedCredentialIndices, generateCombinedCredentials])

  /* --------------------  DCQL evaluation ------------------------- */
  const runQuery = useCallback(() => {
    try {
      const qObj = JSON.parse(query)
      const cArr = JSON.parse(creds)
      if (!Array.isArray(cArr)) throw new Error("Credentials must be an array")
      const parsed = DcqlQuery.parse(qObj)
      DcqlQuery.validate(parsed)
      const {credentials, ...res} = DcqlQuery.query(parsed, cArr)
      setResult(JSON.stringify(res, null, 2))
      setResultData(res)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
      setResult("[]")
      setResultData(null)
    }
  }, [query, creds])

  const debouncedRun = useDebounce(runQuery, 600)

  /* run on first mount */
  useEffect(() => runQuery(), [runQuery])

  /* run when text changes */
  useEffect(() => debouncedRun(), [query, creds, debouncedRun])

  // Handle query selection changes
  const handleQuerySelectionChange = (index: number) => {
    setSelectedQueryIndices((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index)
      } else {
        return [...prev, index].sort()
      }
    })
  }

  // Handle credential selection changes
  const handleCredentialSelectionChange = (index: number) => {
    setSelectedCredentialIndices((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index)
      } else {
        return [...prev, index].sort()
      }
    })
  }

  const resetQueryToDefault = () => {
    setSelectedQueryIndices([0])
    setCredentialSets([])
  }

  const resetCredentialsToDefault = () => {
    setSelectedCredentialIndices([0, 1, 2, 3])
  }


  /* --------------------  RENDER ---------------------------------- */
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ───── Header ───── */}
      <header className="flex items-center justify-between border-b p-2">
        <div className="flex items-center gap-4">
          <div className="relative grid gap-1">
            <img
              alt="Animo Logo"
              width="256"
              height="49"
              className="h-4 md:h-6 w-auto object-contain"
              src="/logo.svg"
            />
            <div className="flex w-full justify-between">
              <span className="text-xs text-muted-foreground font-medium">D</span>
              <span className="text-xs text-muted-foreground font-medium">C</span>
              <span className="text-xs text-muted-foreground font-medium">Q</span>
              <span className="text-xs text-muted-foreground font-medium">L</span>
              <span className="text-xs text-muted-foreground font-medium"> </span>
              <span className="text-xs text-muted-foreground font-medium"> </span>
              <span className="text-xs text-muted-foreground font-medium"> </span>
              <span className="text-xs text-muted-foreground font-medium">P</span>
              <span className="text-xs text-muted-foreground font-medium">L</span>
              <span className="text-xs text-muted-foreground font-medium">A</span>
              <span className="text-xs text-muted-foreground font-medium">Y</span>
              <span className="text-xs text-muted-foreground font-medium">G</span>
              <span className="text-xs text-muted-foreground font-medium">R</span>
              <span className="text-xs text-muted-foreground font-medium">O</span>
              <span className="text-xs text-muted-foreground font-medium">U</span>
              <span className="text-xs text-muted-foreground font-medium">N</span>
              <span className="text-xs text-muted-foreground font-medium">D</span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">DCQL v0.4.0</span>
        </div>
        {mounted && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}
      </header>

      {/* ───── Info Section ───── */}
      <section className="border-b bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p className="max-w-4xl">
            <strong className="text-foreground">DCQL (Digital Credentials Query Language)</strong> is a query language
            for requesting specific claims from digital credentials. Test your DCQL queries against various credential
            formats including mDOC, SD-JWT VC, and W3C VC.
          </p>
          <div className="flex flex-col gap-1 text-xs lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-4">
              <a
                href="https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-digital-credentials-query-l"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                📋 DCQL Specification
              </a>
              <a
                href="https://github.com/openwallet-foundation-labs/dcql-ts"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                🔗 Open Source Library
              </a>
            </div>
            <span className="text-muted-foreground/70">
              Built by <strong>Animo</strong>
            </span>
          </div>
        </div>
      </section>

      {/* ───── Content Grid ───── */}
      <main className="grid flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-2">
        {/* ─── Left column ─── */}
        <section className="flex flex-col min-h-0">
          {/* two stacked editors */}
          <div className="grid flex-1 grid-rows-2 gap-2 min-h-[600px]">
            {/* Query editor with multi-select */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-card">
              <header className="flex items-center justify-between border-b px-3 py-2">
                <h2 className="text-sm font-medium">DCQL Query</h2>
                <div className="flex gap-2">
                  <CredentialSetBuilder
                    credentialSets={credentialSets}
                    onCredentialSetsChange={setCredentialSets}
                    availableCredentialIds={availableCredentialIds}
                  />
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={resetQueryToDefault}>
                    Reset
                  </Button>
                </div>
              </header>

              {/* Query multi-select */}
              <div className="px-3 py-2 border-b">
                <Popover open={queryPopoverOpen} onOpenChange={setQueryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={queryPopoverOpen}
                      className="w-full justify-between h-auto min-h-6 text-xs bg-transparent"
                    >
                      <div className="flex flex-wrap gap-1">
                        {selectedQueryIndices.length === 0 ? (
                          <span className="text-muted-foreground">Select queries...</span>
                        ) : (
                          selectedQueryIndices.map((index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {SAMPLE_QUERIES[index].name}
                            </Badge>
                          ))
                        )}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search queries..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No queries found.</CommandEmpty>
                        <CommandGroup>
                          {SAMPLE_QUERIES.map((sample, index) => (
                            <CommandItem
                              key={index}
                              value={sample.name}
                              onSelect={() => handleQuerySelectionChange(index)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${selectedQueryIndices.includes(index) ? "opacity-100" : "opacity-0"}`}
                              />
                              <span className="text-xs">{sample.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="min-h-0 flex-1">
                <Editor
                  defaultLanguage="json"
                  value={query}
                  onChange={(v) => setQuery(v ?? "")}
                  options={{
                    automaticLayout: true,
                    minimap: { enabled: false },
                    lineNumbers: "off",
                    fontSize: 13,
                    padding: { top: 4, bottom: 4 },
                    wordWrap: "on",
                  }}
                  theme={theme === "dark" ? "vs-dark" : "light"}
                />
              </div>
            </div>

            {/* Credentials editor with multi-select */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-card">
              <header className="flex items-center justify-between border-b px-3 py-2">
                <h2 className="text-sm font-medium">Credentials Array</h2>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={resetCredentialsToDefault}>
                  Reset
                </Button>
              </header>

              {/* Credentials multi-select */}
              <div className="px-3 py-2 border-b">
                <Popover open={credentialPopoverOpen} onOpenChange={setCredentialPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={credentialPopoverOpen}
                      className="w-full justify-between h-auto min-h-6 text-xs bg-transparent"
                    >
                      <div className="flex flex-wrap gap-1">
                        {selectedCredentialIndices.length === 0 ? (
                          <span className="text-muted-foreground">Select credentials...</span>
                        ) : (
                          selectedCredentialIndices.map((index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {SAMPLE_CREDENTIALS[index].name}
                            </Badge>
                          ))
                        )}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search credentials..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No credentials found.</CommandEmpty>
                        <CommandGroup>
                          {SAMPLE_CREDENTIALS.map((sample, index) => (
                            <CommandItem
                              key={index}
                              value={sample.name}
                              onSelect={() => handleCredentialSelectionChange(index)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${selectedCredentialIndices.includes(index) ? "opacity-100" : "opacity-0"}`}
                              />
                              <span className="text-xs">{sample.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="min-h-0 flex-1">
                <Editor
                  defaultLanguage="json"
                  value={creds}
                  onChange={(v) => setCreds(v ?? "")}
                  options={{
                    automaticLayout: true,
                    minimap: { enabled: false },
                    lineNumbers: "off",
                    fontSize: 13,
                    padding: { top: 4, bottom: 4 },
                    wordWrap: "on",
                  }}
                  theme={theme === "dark" ? "vs-dark" : "light"}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Right column ─── */}
        <section className="flex flex-col min-h-0">
          <div className="mb-1" /> {/* spacer for alignment */}
          <div className="flex min-h-[600px] flex-1 overflow-hidden rounded-md border bg-card">
            <div className="flex w-full flex-col">
              <header className="flex items-center justify-between border-b px-3 py-2">
                <h2 className="text-sm font-medium">Results</h2>
                <div className="flex items-center gap-1">
                  <Button
                    variant={viewMode === "code" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setViewMode("code")}
                  >
                    <Code className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={viewMode === "visual" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setViewMode("visual")}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                </div>
              </header>

              {error && (
                <Alert variant="destructive" className="mx-3 my-2 flex items-start text-xs">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  <AlertDescription className="break-all">{error}</AlertDescription>
                </Alert>
              )}

              <div className="min-h-0 flex-1 overflow-auto">
                {viewMode === "code" ? (
                  <Editor
                    defaultLanguage="json"
                    value={result}
                    options={{
                      automaticLayout: true,
                      readOnly: true,
                      minimap: { enabled: false },
                      lineNumbers: "off",
                      fontSize: 13,
                      padding: { top: 4, bottom: 4 },
                      wordWrap: "on",
                    }}
                    theme={theme === "dark" ? "vs-dark" : "light"}
                  />
                ) : (
                  <ResultsVisualization data={resultData} />
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Re-usable card-with-editor component                              */
/* ------------------------------------------------------------------ */
interface CardProps {
  title: string
  value: string
  onReset: () => void
  onChange: (v: string) => void
  theme: string | undefined
}

function CardWithEditor({ title, value, onReset, onChange, theme }: CardProps) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-card">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onReset}>
          Reset
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        <Editor
          defaultLanguage="json"
          value={value}
          onChange={(v) => onChange(v ?? "")}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            lineNumbers: "off",
            fontSize: 13,
            padding: { top: 4, bottom: 4 },
            wordWrap: "on",
          }}
          theme={theme === "dark" ? "vs-dark" : "light"}
        />
      </div>
    </div>
  )
}
